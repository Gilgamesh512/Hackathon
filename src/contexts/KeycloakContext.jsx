import { createContext, useContext, useEffect, useState, useMemo } from "react";
import {
  keycloak,
  getOrInitKeycloak,
  extractKeycloakUserProfile,
  updateKeycloakToken,
  loginWithKeycloak,
  logoutFromKeycloak,
  checkKeycloakServerAlive,
} from "../services/keycloak";

const KeycloakContext = createContext(null);

export function KeycloakProvider({ children }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [initError, setInitError] = useState(null);
  const [tokenSnapshot, setTokenSnapshot] = useState(null);

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
    }),
    [isInitializing, authenticated, user, tokenSnapshot, initError]
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
