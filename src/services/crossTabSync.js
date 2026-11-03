// Real-time Cross-Tab Synchronization & Distributed Honeypot Telemetry Bus
// Powered by HTML5 BroadcastChannel with LocalStorage fallback

const CHANNEL_NAME = "fairenrol_mesh_sync_channel";
const STORAGE_KEY = "fairenrol_last_sync_msg";

let channel = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch (e) {
    console.warn("[CrossTabSync] BroadcastChannel unsupported, using storage fallback");
  }
}

const listeners = new Set();

if (typeof window !== "undefined") {
  if (channel) {
    channel.onmessage = (event) => {
      if (event?.data) {
        notifyListeners(event.data);
      }
    };
  }

  // Fallback listener via storage event
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        notifyListeners(data);
      } catch {}
    }
  });
}

function notifyListeners(data) {
  listeners.forEach((callback) => {
    try {
      callback(data);
    } catch (err) {
      console.error("[CrossTabSync] Error in listener:", err);
    }
  });
}

/**
 * Broadcast an event to all open browser tabs
 */
export function broadcastCrossTab(type, payload = {}) {
  const message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type,
    payload,
    timestamp: new Date().toISOString(),
    senderTabId: getTabId(),
  };

  if (channel) {
    try {
      channel.postMessage(message);
    } catch (e) {
      console.warn("[CrossTabSync] Failed postMessage:", e);
    }
  }

  // Fallback storage sync
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
    } catch {}
  }
}

/**
 * Subscribe to cross-tab broadcast events
 * @returns {Function} unsubscribe cleanup function
 */
export function subscribeCrossTab(callback) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

let sessionTabId = null;
export function getTabId() {
  if (!sessionTabId) {
    sessionTabId = `tab_${Math.random().toString(36).substr(2, 6)}`;
  }
  return sessionTabId;
}
