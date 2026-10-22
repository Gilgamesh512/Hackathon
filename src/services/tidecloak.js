// FairEnrol TideCloak Auth & IAM Integration Helper

const ENV_AUTH_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_OIDC_URL) ||
  "http://localhost:8081";

const ENV_REALM =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_OIDC_REALM) ||
  "fairenrol";

const ENV_CLIENT_ID =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_OIDC_CLIENT_ID) ||
  "fairenrol-app";

export const DEFAULT_TIDECLOAK_CONFIG = {
  realm: ENV_REALM,
  authServerUrl: ENV_AUTH_URL.replace(/\/?$/, "/"),
  clientId: ENV_CLIENT_ID,
  appPort: 5137,
};

export const DOCKER_COMMAND =
  "docker run -d -p 8081:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=password tideorg/tidecloak-dev:latest";

/**
 * Checks whether the local TideCloak server is alive and accepting HTTP requests.
 * Prevents browser ERR_CONNECTION_REFUSED when TideCloak container is not running.
 */
export async function checkTideServerAvailable(authServerUrl = ENV_AUTH_URL) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const checkUrl = `${authServerUrl.replace(/\/$/, "")}/realms/${ENV_REALM}/.well-known/openid-configuration`;

    await fetch(checkUrl, {
      method: "GET",
      mode: "no-cors",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Extracts a normalized user profile from the TideCloak token claims
 */
export function extractUserProfile(getValueFromToken) {
  if (!getValueFromToken) return null;

  try {
    const sub = getValueFromToken("sub");
    if (!sub) return null;

    const username =
      getValueFromToken("preferred_username") ||
      getValueFromToken("name") ||
      "Tide User";
    const email = getValueFromToken("email") || "";
    const name = getValueFromToken("name") || username;

    const realmAccess = getValueFromToken("realm_access") || {};
    const roles = Array.isArray(realmAccess.roles) ? realmAccess.roles : [];

    return {
      id: sub,
      username,
      name,
      email,
      roles,
      hasRegistrarRole: roles.includes("registrar") || roles.includes("admin"),
      hasApproverRole: roles.includes("approver"),
      hasStudentRole: roles.includes("student"),
    };
  } catch (e) {
    console.error("Error parsing TideCloak token claims", e);
    return null;
  }
}

/**
 * Secret passcode used for demo cryptographic derivation for the approver panel.
 * In a full production deployment with Tide Tag-based E2EE, this is derived from the Approver's decentralized key.
 */
export const APPROVER_SECRET_KEY = "TIDECLOAK_PANEL_SECRET_KEY_2026";
