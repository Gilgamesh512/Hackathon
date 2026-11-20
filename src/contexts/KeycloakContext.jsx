import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import {
  keycloak,
  getOrInitKeycloak,
  extractKeycloakUserProfile,
  updateKeycloakToken,
  loginWithKeycloak,
  logoutFromKeycloak,
  checkKeycloakServerAlive,
} from "../services/keycloak";
import { broadcastCrossTab, subscribeCrossTab } from "../services/crossTabSync";

const KeycloakContext = createContext(null);

export function KeycloakProvider({ children }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [initError, setInitError] = useState(null);
  const [tokenSnapshot, setTokenSnapshot] = useState(null);

  // TideCloak Adaptive Incident Response & Session Quarantine State
  const [quarantineState, setQuarantineState] = useState({
    isQuarantined: false,
    reason: null,
    threatLevel: null,
    actor: null,
    timestamp: null,
    evidenceChecksum: null,
  });

  const triggerQuarantine = useCallback(
    ({ reason, threatLevel, actor, evidenceChecksum }) => {
      const quarantinedActor = actor || user?.name || user?.username || "Active Session";
      const incidentData = {
        isQuarantined: true,
        reason: reason || "Canary Decoy Exfiltration Trap Sprung (rec_canary_999)",
        threatLevel: threatLevel || "CRITICAL",
        actor: quarantinedActor,
        timestamp: new Date().toISOString(),
        evidenceChecksum: evidenceChecksum || null,
      };
      setQuarantineState(incidentData);

      // Invalidate active session immediately to block lateral movement
      setAuthenticated(false);
      setTokenSnapshot(null);

      // Broadcast across all open browser windows/tabs
      broadcastCrossTab("TIDECLOAK_QUARANTINE_TRIGGERED", incidentData);
    },
    [user]
  );

  const dismissQuarantine = useCallback(() => {
    setQuarantineState({
      isQuarantined: false,
      reason: null,
      threatLevel: null,
      actor: null,
      timestamp: null,
      evidenceChecksum: null,
    });
  }, []);

  // Listen for cross-tab quarantine events
  useEffect(() => {
    const unsubscribe = subscribeCrossTab((msg) => {
      if (msg.type === "TIDECLOAK_QUARANTINE_TRIGGERED" && msg.payload) {
        setQuarantineState(msg.payload);
        setAuthenticated(false);
        setTokenSnapshot(null);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Register event listeners on Keycloak singleton
    keycloak.onTokenExpired = () => {
      console.debug("[Keycloak] Token expired event triggered. Attempting refresh...");
      updateKeycloakToken(60)
        .then((refreshed) => {
          if (refreshed && isMounted) {
            setTokenSnapshot(keycloak.token);
            setUser(extractKeycloakUserProfile(keycloak));
          }
        })
        .catch((err) => {
          console.error("[Keycloak] Automatic token refresh failed:", err);
        });
    };

    keycloak.onAuthLogout = () => {
      if (isMounted) {
        setAuthenticated(false);
        setUser(null);
        setTokenSnapshot(null);
      }
    };

    // Initialize Keycloak SDK once
    getOrInitKeycloak()
      .then((isAuth) => {
        if (!isMounted) return;

        const authState = Boolean(isAuth && keycloak.authenticated);
        setAuthenticated(authState);

        if (authState) {
          setUser(extractKeycloakUserProfile(keycloak));
          setTokenSnapshot(keycloak.token);

          // Clean up URL parameters (e.g. ?code=...&state=...) from OAuth redirect
          if (window.location.search.includes("code=") || window.location.search.includes("state=")) {
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn("[Keycloak] Server not reachable or init error:", err);
        setInitError(err instanceof Error ? err : new Error(String(err)));
        setAuthenticated(false);
      })
      .finally(() => {
        if (isMounted) {
          setIsInitializing(false);
        }
      });

    // Proactive token refresh interval (every 40 seconds)
    const refreshInterval = setInterval(() => {
      if (keycloak.authenticated) {
        updateKeycloakToken(60).then((refreshed) => {
          if (refreshed && isMounted) {
            setTokenSnapshot(keycloak.token);
            setUser(extractKeycloakUserProfile(keycloak));
          }
        });
      }
    }, 40000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, []);

  const hasRealmRole = (role) => {
    if (!authenticated || !user) return false;
    return user.roles.includes(role);
  };

  const contextValue = useMemo(
    () => ({
      keycloak,
      isInitializing,
      authenticated,
      user,
      token: tokenSnapshot,
      initError,
      login: loginWithKeycloak,
      logout: logoutFromKeycloak,
      refreshToken: () => updateKeycloakToken(10),
      hasRealmRole,
      checkServerAlive: checkKeycloakServerAlive,
      quarantineState,
      triggerQuarantine,
      dismissQuarantine,
    }),
    [
      isInitializing,
      authenticated,
      user,
      tokenSnapshot,
      initError,
      quarantineState,
      triggerQuarantine,
      dismissQuarantine,
    ]
  );

  return (
    <KeycloakContext.Provider value={contextValue}>
      {children}
    </KeycloakContext.Provider>
  );
}

/**
 * Custom hook to consume Keycloak auth state throughout the app.
 */
export function useKeycloak() {
  const context = useContext(KeycloakContext);
  if (!context) {
    throw new Error("useKeycloak must be used within a KeycloakProvider");
  }
  return context;
}

/**
 * Protected Route / Component Guard
 * Conditionally renders children based on Keycloak authentication and optional realm role.
 */
export function ProtectedRoute({ role, children, fallback }) {
  const { authenticated, hasRealmRole, isInitializing, login } = useKeycloak();

  if (isInitializing) {
    return <div className="notice">Verifying Keycloak session…</div>;
  }

  if (!authenticated) {
    if (fallback) return fallback;
    return (
      <div className="notice crypto-denied" role="alert">
        <strong>🔒 Protected Feature · Authentication Required</strong>
        <p>This action requires an authenticated Keycloak session.</p>
        <button className="button dark mini" style={{ marginTop: "8px" }} onClick={() => login()}>
          Log in with Keycloak
        </button>
      </div>
    );
  }

  if (role && !hasRealmRole(role)) {
    if (fallback) return fallback;
    return (
      <div className="notice crypto-denied" role="alert">
        <strong>⛔ Access Forbidden · Insufficient Privileges</strong>
        <p>
          Your account does not hold the required <code>{role}</code> realm role in Keycloak.
        </p>
      </div>
    );
  }

  return children;
}
