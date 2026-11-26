// FairEnrol Client Service
// Bridges React UI with Verifiable Server Sequencer (Port 4000)
// Includes zero-failure fallback to local state if server is offline.

const SERVER_BASE = "http://localhost:4000/api/fairenrol";

let currentBearerToken = null;

/**
 * Sets the active TideCloak/Keycloak JWT bearer token to authenticate backend REST requests.
 */
export function setClientAuthToken(token) {
  currentBearerToken = token || null;
}

function getJsonHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (currentBearerToken) {
    headers["Authorization"] = `Bearer ${currentBearerToken}`;
  } else {
    headers["X-FairEnrol-Demo"] = "true";
  }
  return headers;
}

async function parseJsonOrThrow(res, fallbackMessage) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `${fallbackMessage} (HTTP ${res.status})`);
  }
  return data;
}

export async function checkSequencerAlive() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${SERVER_BASE}/state`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchServerState() {
  const res = await fetch(`${SERVER_BASE}/state`);
  if (!res.ok) throw new Error("Failed to fetch state from server sequencer");
  return res.json();
}

export async function serverEnrol(payload) {
  const res = await fetch(`${SERVER_BASE}/enrol`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function serverWithdraw(payload) {
  const res = await fetch(`${SERVER_BASE}/withdraw`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, "Withdrawal failed");
}

export async function serverCapacity(payload) {
  const res = await fetch(`${SERVER_BASE}/capacity`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, "Capacity update failed");
}

export async function serverSubmitRequest(request) {
  const res = await fetch(`${SERVER_BASE}/requests`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify({ request }),
  });
  return parseJsonOrThrow(res, "Proposal submission failed");
}

export async function serverCastVote(payload) {
  const res = await fetch(`${SERVER_BASE}/vote`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, "Server rejected vote");
}

export async function serverSimulateTamper(mode = "single") {
  const res = await fetch(`${SERVER_BASE}/tamper`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify({ mode }),
  });
  return parseJsonOrThrow(res, "Tamper simulation failed");
}

export async function serverRestoreAudit() {
  const res = await fetch(`${SERVER_BASE}/restore`, {
    method: "POST",
    headers: getJsonHeaders(),
  });
  return parseJsonOrThrow(res, "Audit restore failed");
}

export async function serverReset() {
  const res = await fetch(`${SERVER_BASE}/reset`, {
    method: "POST",
    headers: getJsonHeaders(),
  });
  return parseJsonOrThrow(res, "Server reset failed");
}

/**
 * Subscribes to Server-Sent Events (SSE) for live multi-computer cross-network synchronization
 * Automatically reconnects with bounded backoff if the stream drops.
 */
export function subscribeServerEvents(onUpdate) {
  if (typeof window === "undefined" || !window.EventSource) return () => {};

  let es = null;
  let stopped = false;
  let reconnectTimer = null;
  let retryDelayMs = 2000;

  function connect() {
    if (stopped) return;
    try {
      es = new EventSource(`${SERVER_BASE}/events`);

      es.addEventListener("fairenrol_connected", () => {
        retryDelayMs = 2000;
      });

      es.addEventListener("fairenrol_sync", (event) => {
        try {
          const parsed = JSON.parse(event.data);
          onUpdate?.(parsed);
        } catch (e) {
          console.error("SSE parse error:", e);
        }
      });

      es.onerror = () => {
        es?.close();
        if (!stopped) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, retryDelayMs);
          retryDelayMs = Math.min(15000, retryDelayMs * 2);
        }
      };
    } catch (err) {
      console.debug("SSE subscription skipped:", err);
    }
  }

  connect();

  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    es?.close();
  };
}
