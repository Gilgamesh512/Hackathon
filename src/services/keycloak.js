// Keycloak Service Singleton with Authorization Code Flow + PKCE (S256)
import Keycloak from "keycloak-js";

// Read configuration from Vite environment variables (.env.local)
const authServerUrl = (
  import.meta.env.VITE_OIDC_URL || "http://localhost:8081"
).replace(/\/?$/, "");

const realm = import.meta.env.VITE_OIDC_REALM || "fairenrol";
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID || "fairenrol-app";

// 1. Initialize Keycloak singleton instance
export const keycloak = new Keycloak({
  url: authServerUrl,
  realm,
  clientId,
});

let initPromise = null;

/**
 * Initializes the Keycloak SDK exactly once using Authorization Code Flow + PKCE (S256).
 * Safe against React 18/19 StrictMode double-mounting.
 */
export function getOrInitKeycloak() {
  if (initPromise) {
    return initPromise;
  }

  const silentCheckSsoRedirectUri = `${window.location.origin}/silent-check-sso.html`;

  initPromise = keycloak
    .init({
      onLoad: "check-sso",
      silentCheckSsoRedirectUri,
      pkceMethod: "S256",
      flow: "standard", // Authorization Code Flow + PKCE
      checkLoginIframe: false, // Prevents modern third-party cookie blocking issues
      enableLogging: true,
    })
    .catch((err) => {
      console.error("[Keycloak] Initialization failed:", err);
      throw err;
    });

  return initPromise;
}

/**
 * Normalizes user profile and realm roles from Keycloak tokens.
 * Stored purely in-memory; no sensitive tokens placed in localStorage.
 */
export function extractKeycloakUserProfile(kc = keycloak) {
  if (!kc || !kc.authenticated) return null;

  const tokenParsed = kc.tokenParsed || {};
  const idTokenParsed = kc.idTokenParsed || {};

  const realmAccess = tokenParsed.realm_access || {};
  const roles = Array.isArray(realmAccess.roles) ? realmAccess.roles : [];

  const username =
    tokenParsed.preferred_username ||
    idTokenParsed.preferred_username ||
    tokenParsed.sub ||
    "Keycloak User";

  const name =
    tokenParsed.name ||
    idTokenParsed.name ||
    `${tokenParsed.given_name || ""} ${tokenParsed.family_name || ""}`.trim() ||
    username;

  const email = tokenParsed.email || idTokenParsed.email || "";

  return {
    id: tokenParsed.sub || idTokenParsed.sub || "",
    username,
    name,
    email,
    roles,
    hasRegistrarRole: roles.includes("registrar") || roles.includes("admin"),
    hasApproverRole: roles.includes("approver"),
    hasStudentRole: roles.includes("student"),
  };
}

/**
 * Refreshes the access token if it will expire within minValidity seconds.
 */
export async function updateKeycloakToken(minValidity = 60) {
  if (!keycloak.authenticated) return false;
  try {
    const refreshed = await keycloak.updateToken(minValidity);
    if (refreshed) {
      console.debug("[Keycloak] Access token refreshed successfully");
    }
    return refreshed;
  } catch (error) {
    console.error("[Keycloak] Failed to refresh token, user may need to re-authenticate:", error);
    return false;
  }
}

/**
 * Initiates login redirect to Keycloak 8081 with Authorization Code + PKCE S256
 */
export function loginWithKeycloak(options = {}) {
  return keycloak.login({
    redirectUri: window.location.origin + "/",
    ...options,
  });
}

/**
 * Initiates logout redirect
 */
export function logoutFromKeycloak(options = {}) {
  return keycloak.logout({
    redirectUri: window.location.origin + "/",
    ...options,
  });
}

/**
 * Checks whether the Keycloak server at 8081 is accessible before redirecting.
 */
export async function checkKeycloakServerAlive() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const checkUrl = `${authServerUrl}/realms/${realm}/.well-known/openid-configuration`;

    await fetch(checkUrl, {
      method: "GET",
      mode: "no-cors",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}
