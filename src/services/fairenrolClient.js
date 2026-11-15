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
  }
  return headers;
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
  return res.json();
}

export async function serverCapacity(payload) {
  const res = await fetch(`${SERVER_BASE}/capacity`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function serverSubmitRequest(request) {
  const res = await fetch(`${SERVER_BASE}/requests`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify({ request }),
  });
  return res.json();
}

export async function serverCastVote(payload) {
  const res = await fetch(`${SERVER_BASE}/vote`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Server rejected vote");
  }
  return data;
}

export async function serverSimulateTamper(mode = "single") {
  const res = await fetch(`${SERVER_BASE}/tamper`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify({ mode }),
  });
  return res.json();
}

export async function serverReset() {
  const res = await fetch(`${SERVER_BASE}/reset`, {
    method: "POST",
    headers: getJsonHeaders(),
  });
  return res.json();
}

/**
 * Subscribes to Server-Sent Events (SSE) for live multi-computer cross-network synchronization
 */
export function subscribeServerEvents(onUpdate) {
  if (typeof window === "undefined" || !window.EventSource) return () => {};

  try {
    const es = new EventSource(`${SERVER_BASE}/events`);

    es.addEventListener("fairenrol_sync", (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onUpdate?.(parsed);
      } catch (e) {
        console.error("SSE parse error:", e);
      }
    });

    es.onerror = () => {
      // Stream error / connection closed
      es.close();
    };

    return () => {
      es.close();
    };
  } catch (err) {
    console.debug("SSE subscription skipped:", err);
    return () => {};
  }
}
