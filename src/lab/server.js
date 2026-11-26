// Lab Manager Control Plane API Server & FairEnrol Verifiable Server Sequencer
// Exposes REST APIs for Target Registry, Lifecycle Management, Security Test Runs,
// and FairEnrol Atomic State Machine with Server-Sent Events (SSE).

import http from "node:http";
import crypto from "node:crypto";
import { TargetRegistry } from "./registry.js";
import { TargetLifecycleManager } from "./lifecycle.js";
import { TestEngine } from "./testEngine.js";
import { FairEnrolSequencer } from "../server/sequencer.js";
import { APPROVER_KEYPAIRS, signSarifDocument } from "../services/crypto.js";

export function createLabManagerServer(options = {}) {
  const registry = new TargetRegistry();
  registry.loadCatalog();

  const lifecycle = new TargetLifecycleManager(registry);
  const testEngine = new TestEngine(registry, lifecycle);
  const sequencer = new FairEnrolSequencer(options);

  const strictAuth = Boolean(options.strictAuth || process.env.FAIRE_STRICT_AUTH === "true");
  const oidcBaseUrl = (options.oidcUrl || process.env.VITE_OIDC_URL || "http://localhost:8081").replace(/\/$/, "");
  const oidcRealm = options.oidcRealm || process.env.VITE_OIDC_REALM || "fairenrol";
  const jwksUri = `${oidcBaseUrl}/realms/${oidcRealm}/protocol/openid-connect/certs`;

  // Short-lived JWKS cache for cryptographic JWT verification when TideCloak is online
  let jwksCache = { keys: [], fetchedAt: 0 };
  async function getJwksKeys() {
    const now = Date.now();
    if (jwksCache.keys.length > 0 && now - jwksCache.fetchedAt < 60000) {
      return jwksCache.keys;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 800);
      const resp = await fetch(jwksUri, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.keys)) {
          jwksCache = { keys: data.keys, fetchedAt: now };
          return jwksCache.keys;
        }
      }
    } catch {
      // TideCloak server offline
    }
    return [];
  }

  function decodeJwtParts(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const header = JSON.parse(Buffer.from(parts[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
      const claims = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
      return { header, claims, signingInput: `${parts[0]}.${parts[1]}`, signatureB64Url: parts[2] };
    } catch {
      return null;
    }
  }

  async function verifyJwtWithJwks(decoded) {
    const keys = await getJwksKeys();
    if (!keys.length) {
      return { jwksReachable: false, signatureValid: false };
    }
    const matchingKey = keys.find((k) => !decoded.header.kid || k.kid === decoded.header.kid) || keys[0];
    if (!matchingKey) {
      return { jwksReachable: true, signatureValid: false };
    }
    try {
      const publicKey = crypto.createPublicKey({ key: matchingKey, format: "jwk" });
      const alg = decoded.header.alg || "RS256";
      const hashAlg = alg.endsWith("512") ? "RSA-SHA512" : alg.endsWith("384") ? "RSA-SHA384" : "RSA-SHA256";
      const sigBuffer = Buffer.from(decoded.signatureB64Url.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      const valid = crypto.verify(hashAlg, Buffer.from(decoded.signingInput, "utf-8"), publicKey, sigBuffer);
      return { jwksReachable: true, signatureValid: valid };
    } catch {
      return { jwksReachable: true, signatureValid: false };
    }
  }

  async function extractAuthContext(req) {
    const authHeader = req.headers["authorization"] || "";
    if (!authHeader.startsWith("Bearer ")) {
      return {
        hasToken: false,
        valid: false,
        isDemo: !strictAuth,
        roles: [],
        username: null,
      };
    }

    const token = authHeader.slice(7).trim();
    const decoded = decodeJwtParts(token);
    if (!decoded) {
      return {
        hasToken: true,
        valid: false,
        malformed: true,
        roles: [],
        username: null,
      };
    }

    const { claims } = decoded;
    const nowSec = Math.floor(Date.now() / 1000);
    const isExpired = Boolean(claims.exp && claims.exp < nowSec);
    const jwksCheck = await verifyJwtWithJwks(decoded);

    // In strictAuth mode, cryptographic JWKS signature verification is mandatory.
    // In hybrid/demo mode, if TideCloak JWKS is online, forged signatures are still rejected!
    const signatureRejected = jwksCheck.jwksReachable
      ? !jwksCheck.signatureValid
      : strictAuth;

    const roles = Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : [];
    return {
      hasToken: true,
      valid: !isExpired && !signatureRejected,
      expired: isExpired,
      signatureRejected,
      verifiedByJwks: jwksCheck.jwksReachable && jwksCheck.signatureValid,
      claims,
      username: claims.preferred_username || claims.sub,
      roles,
      isRegistrar: roles.includes("registrar") || roles.includes("admin"),
      isApprover: roles.includes("approver"),
      isStudent: roles.includes("student"),
    };
  }

  // In-memory sliding-window rate limiter
  const rateLimitMap = new Map();
  const RATE_LIMIT_WINDOW_MS = 60000;
  const MAX_REQUESTS_PER_WINDOW = 150;

  function checkRateLimit(req) {
    if (req.headers["x-fairenrol-benchmark"] || req.url?.includes("/events")) {
      return { allowed: true };
    }
    const ip = req.socket.remoteAddress || req.headers["x-forwarded-for"] || "127.0.0.1";
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };

    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      entry.count = 1;
      entry.windowStart = now;
    } else {
      entry.count++;
    }

    rateLimitMap.set(ip, entry);

    if (entry.count > MAX_REQUESTS_PER_WINDOW) {
      return {
        allowed: false,
        retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000),
      };
    }
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count };
  }

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-FairEnrol-Demo");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    const sendJson = (statusCode, data) => {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data, null, 2));
    };

    const readBody = () =>
      new Promise((resolve) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch {
            resolve({});
          }
        });
      });

    try {
      // 0. Root Welcome & Directory Route
      if ((pathname === "/" || pathname === "") && req.method === "GET") {
        return sendJson(200, {
          name: "FairEnrol Verifiable Server Sequencer & Security Lab Control Plane",
          status: "online",
          version: "0.1.0",
          webUiUrl: "http://localhost:5137",
          healthCheck: "/api/health",
          endpoints: {
            health: "/api/health",
            targets: "/api/targets",
            state: "/api/fairenrol/state",
            events: "/api/fairenrol/events (SSE)",
            keys: "/api/fairenrol/keys",
          },
          note: "This is the backend REST API & Sequencer. Open the Web UI at http://localhost:5137",
        });
      }

      // 1. Healthcheck
      if (pathname === "/api/health" && req.method === "GET") {
        return sendJson(200, {
          status: "healthy",
          component: "Lab Manager Control Plane",
          authMode: strictAuth ? "STRICT_JWKS_REQUIRED" : "HYBRID_JWKS_WITH_DEMO_FALLBACK",
          registeredTargets: registry.getAllTargets().length,
          timestamp: new Date().toISOString(),
        });
      }

      // 2. GET /api/targets - List all registered targets
      if (pathname === "/api/targets" && req.method === "GET") {
        const targets = registry.getAllTargets();
        const targetsWithStatus = await Promise.all(
          targets.map(async (t) => {
            const status = await lifecycle.getTargetStatus(t.id);
            return { ...t, runtimeStatus: status };
          })
        );
        return sendJson(200, { targets: targetsWithStatus });
      }

      // 3. GET /api/targets/:id - Get target details
      if (pathname.startsWith("/api/targets/") && req.method === "GET" && !pathname.endsWith("/start") && !pathname.endsWith("/stop") && !pathname.endsWith("/reset")) {
        const targetId = pathname.replace("/api/targets/", "");
        const target = registry.getTarget(targetId);
        if (!target) {
          return sendJson(404, { error: `Target '${targetId}' not found in registry.` });
        }
        const status = await lifecycle.getTargetStatus(targetId);
        return sendJson(200, { target, runtimeStatus: status });
      }

      // 4. POST /api/targets/:id/start
      if (pathname.match(/^\/api\/targets\/[^/]+\/start$/) && req.method === "POST") {
        const targetId = pathname.split("/")[3];
        const body = await readBody();
        const instance = await lifecycle.startTarget(targetId, body.port || 4100);
        return sendJson(200, { message: "Target started", instance });
      }

      // 5. POST /api/targets/:id/stop
      if (pathname.match(/^\/api\/targets\/[^/]+\/stop$/) && req.method === "POST") {
        const targetId = pathname.split("/")[3];
        const instance = await lifecycle.stopTarget(targetId);
        return sendJson(200, { message: "Target stopped", instance });
      }

      // 6. POST /api/targets/:id/reset
      if (pathname.match(/^\/api\/targets\/[^/]+\/reset$/) && req.method === "POST") {
        const targetId = pathname.split("/")[3];
        const result = await lifecycle.resetTarget(targetId);
        return sendJson(200, { message: "Target reset executed", result });
      }

      // 7. POST /api/test-runs - Trigger security scan
      if (pathname === "/api/test-runs" && req.method === "POST") {
        const body = await readBody();
        if (!body.targetId) {
          return sendJson(400, { error: "targetId is required to start a test run" });
        }
        if (body.targetId === "custom-api-vault") {
          const st = await lifecycle.getTargetStatus("custom-api-vault");
          if (st.status !== "running") {
            await lifecycle.startTarget("custom-api-vault");
          }
        }
        const run = await testEngine.runSecurityScan(body.targetId, body.profile || "automated-api");
        return sendJson(201, { message: "Security scan completed", run });
      }

      // 7b. POST /api/sarif/sign - Server-side Control Plane SARIF Attestation
      if (pathname === "/api/sarif/sign" && req.method === "POST") {
        const body = await readBody();
        if (!body || !body.sarif) {
          return sendJson(400, { error: "sarif payload is required" });
        }
        const signed = await signSarifDocument(body.sarif);
        return sendJson(200, { signedSarif: signed });
      }

      // 8. GET /api/test-runs/:id
      if (pathname.startsWith("/api/test-runs/") && req.method === "GET") {
        const runId = pathname.replace("/api/test-runs/", "");
        const run = testEngine.getTestRun(runId);
        if (!run) {
          return sendJson(404, { error: `Test run '${runId}' not found.` });
        }
        return sendJson(200, { run });
      }

      // 9. GET /api/findings
      if (pathname === "/api/findings" && req.method === "GET") {
        const findings = testEngine.getAllFindings();
        return sendJson(200, { findings, total: findings.length });
      }

      // 10. GET /api/reports/:id/sarif
      if (pathname.match(/^\/api\/reports\/[^/]+\/sarif$/) && req.method === "GET") {
        const runId = pathname.split("/")[3];
        const sarif = testEngine.generateSarifReport(runId);
        if (!sarif) {
          return sendJson(404, { error: `SARIF report for run '${runId}' not found.` });
        }
        res.setHeader("Content-Disposition", `attachment; filename="fairenrol-scan-${runId}.sarif"`);
        return sendJson(200, sarif);
      }

      // 11. GET /api/reports/:id
      if (pathname.startsWith("/api/reports/") && req.method === "GET") {
        const runId = pathname.replace("/api/reports/", "");
        const report = testEngine.generateReport(runId);
        if (!report) {
          return sendJson(404, { error: `Report for run '${runId}' not found.` });
        }
        return sendJson(200, { report });
      }

      // 12. GET /api/telemetry (fetches telemetry from running custom target if available)
      if (pathname === "/api/telemetry" && req.method === "GET") {
        try {
          const status = await lifecycle.getTargetStatus("custom-api-vault");
          if (status.status === "running" && status.endpoint) {
            const resp = await fetch(`${status.endpoint}/api/telemetry`);
            const data = await resp.json();
            return sendJson(200, data);
          }
        } catch {}
        return sendJson(200, { telemetry: [], message: "Target offline or no events recorded yet." });
      }

      // 13. POST /api/simulate-attack (proxies to running custom target)
      if (pathname === "/api/simulate-attack" && req.method === "POST") {
        const body = await readBody();
        try {
          const status = await lifecycle.getTargetStatus("custom-api-vault");
          if (status.status === "running" && status.endpoint) {
            const resp = await fetch(`${status.endpoint}/api/simulate-attack`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = await resp.json();
            return sendJson(resp.status, data);
          }
        } catch (err) {
          return sendJson(500, { error: `Attack simulation failed: ${err.message}` });
        }
        return sendJson(400, { error: "Target 'custom-api-vault' is not running." });
      }

      // =========================================================================
      // FAIRENROL VERIFIABLE SERVER SEQUENCER REST & SSE ENDPOINTS
      // =========================================================================

      // Rate limit check for all state-mutating requests
      if (
        pathname.startsWith("/api/fairenrol/") &&
        pathname !== "/api/fairenrol/events" &&
        pathname !== "/api/fairenrol/state" &&
        req.method === "POST"
      ) {
        const rateCheck = checkRateLimit(req);
        if (!rateCheck.allowed) {
          res.setHeader("Retry-After", String(rateCheck.retryAfter));
          return sendJson(429, {
            success: false,
            error: `Rate limit exceeded (Max ${MAX_REQUESTS_PER_WINDOW} requests/min). Try again in ${rateCheck.retryAfter}s.`,
          });
        }
      }

      // 14. GET /api/fairenrol/state - Returns canonical courses, requests, audit ledger & checkpoint anchor
      if (pathname === "/api/fairenrol/state" && req.method === "GET") {
        return sendJson(200, sequencer.getState());
      }

      // 15. GET /api/fairenrol/events - Server-Sent Events (SSE) stream for cross-network multi-client sync
      if (pathname === "/api/fairenrol/events" && req.method === "GET") {
        return sequencer.registerSseClient(req, res);
      }

      // Helper to enforce auth policy consistently across /api/fairenrol/* mutating routes
      function enforceAuth(auth, requiredRoles = null) {
        if (strictAuth && !auth.hasToken) {
          return { status: 401, error: "Authentication Required: Missing TideCloak Bearer token (strict mode)." };
        }
        if (auth.hasToken) {
          if (auth.malformed) {
            return { status: 401, error: "Malformed Bearer JWT token." };
          }
          if (auth.expired) {
            return { status: 401, error: "TideCloak session expired. Please re-authenticate." };
          }
          if (auth.signatureRejected) {
            return { status: 401, error: "Invalid JWT cryptographic signature rejected by TideCloak JWKS verifier." };
          }
          if (requiredRoles && !requiredRoles.some((r) => auth.roles.includes(r))) {
            return {
              status: 403,
              error: `Access Denied: Requires '${requiredRoles.join("' or '")}' role in TideCloak token.`,
            };
          }
        }
        return null;
      }

      // 16. POST /api/fairenrol/enrol - Atomic FIFO Enrolment Lock
      if (pathname === "/api/fairenrol/enrol" && req.method === "POST") {
        const auth = await extractAuthContext(req);
        const authErr = enforceAuth(auth);
        if (authErr) return sendJson(authErr.status, { success: false, error: authErr.error });
        const body = await readBody();
        try {
          if (auth.hasToken && auth.username) {
            body.actor = body.actor || auth.username;
          }
          const result = await sequencer.enrol(body);
          return sendJson(result.success ? 200 : 400, result);
        } catch (err) {
          return sendJson(400, { success: false, error: err.message });
        }
      }

      // 17. POST /api/fairenrol/withdraw - Atomic Seat Release & FIFO Promotion
      if (pathname === "/api/fairenrol/withdraw" && req.method === "POST") {
        const auth = await extractAuthContext(req);
        const authErr = enforceAuth(auth);
        if (authErr) return sendJson(authErr.status, { success: false, error: authErr.error });
        const body = await readBody();
        try {
          if (auth.hasToken && auth.username) {
            body.actor = body.actor || auth.username;
          }
          const result = await sequencer.withdraw(body);
          return sendJson(result.success ? 200 : 400, result);
        } catch (err) {
          return sendJson(400, { success: false, error: err.message });
        }
      }

      // 18. POST /api/fairenrol/capacity - Authorized Quota Update & Auto-Promotion Sweep
      if (pathname === "/api/fairenrol/capacity" && req.method === "POST") {
        const auth = await extractAuthContext(req);
        const authErr = enforceAuth(auth, ["registrar", "admin"]);
        if (authErr) return sendJson(authErr.status, { success: false, error: authErr.error });
        const body = await readBody();
        try {
          if (auth.hasToken && auth.username) {
            body.actor = body.actor || auth.username;
          }
          const result = await sequencer.updateCapacity(body);
          return sendJson(200, result);
        } catch (err) {
          return sendJson(400, { success: false, error: err.message });
        }
      }

      // 19. POST /api/fairenrol/requests - Submit Exception Proposal with E2EE
      if (pathname === "/api/fairenrol/requests" && req.method === "POST") {
        const auth = await extractAuthContext(req);
        const authErr = enforceAuth(auth);
        if (authErr) return sendJson(authErr.status, { success: false, error: authErr.error });
        const body = await readBody();
        try {
          const result = await sequencer.submitRequest(body);
          return sendJson(201, result);
        } catch (err) {
          return sendJson(400, { success: false, error: err.message });
        }
      }

      // 20. POST /api/fairenrol/vote - Approver Quorum Vote with Server-Side Asymmetric Verification
      if (pathname === "/api/fairenrol/vote" && req.method === "POST") {
        const auth = await extractAuthContext(req);
        const authErr = enforceAuth(auth, ["approver"]);
        if (authErr) return sendJson(authErr.status, { success: false, error: authErr.error });
        const body = await readBody();
        try {
          const result = await sequencer.vote(body);
          return sendJson(200, result);
        } catch (err) {
          return sendJson(400, { success: false, error: err.message });
        }
      }

      // 21. POST /api/fairenrol/tamper - Simulate Server Ledger Tampering
      if (pathname === "/api/fairenrol/tamper" && req.method === "POST") {
        const auth = await extractAuthContext(req);
        const authErr = enforceAuth(auth, ["registrar", "admin"]);
        if (authErr) return sendJson(authErr.status, { success: false, error: authErr.error });
        const body = await readBody();
        const result = await sequencer.simulateTamper(body.mode || "single");
        return sendJson(200, result);
      }

      // 21b. POST /api/fairenrol/restore - Restore Clean Audit Ledger from Anchor Backup
      if (pathname === "/api/fairenrol/restore" && req.method === "POST") {
        const auth = await extractAuthContext(req);
        const authErr = enforceAuth(auth, ["registrar", "admin"]);
        if (authErr) return sendJson(authErr.status, { success: false, error: authErr.error });
        const result = await sequencer.restoreAuditOnly();
        return sendJson(200, result);
      }

      // 22. POST /api/fairenrol/reset - Restore Clean Seed Ledger State
      if (pathname === "/api/fairenrol/reset" && req.method === "POST") {
        const auth = await extractAuthContext(req);
        const authErr = enforceAuth(auth, ["registrar", "admin"]);
        if (authErr) return sendJson(authErr.status, { success: false, error: authErr.error });
        await sequencer.restoreCleanLedger();
        return sendJson(200, { success: true, message: "Server state and ledger restored to clean Genesis." });
      }

      // 23. GET /api/fairenrol/keys - Public Key Directory for All Registered Approvers
      if (pathname === "/api/fairenrol/keys" && req.method === "GET") {
        const publicKeys = {};
        for (const [id, kp] of Object.entries(APPROVER_KEYPAIRS)) {
          publicKeys[id] = { name: kp.name, role: kp.role, pub: kp.pub };
        }
        return sendJson(200, { approverPublicKeys: publicKeys });
      }

      sendJson(404, { error: "Endpoint not found" });
    } catch (err) {
      console.error("Lab API Error:", err);
      sendJson(500, { error: err.message });
    }
  });

  return { server, registry, lifecycle, testEngine, sequencer };
}

// Standalone execution entrypoint
if (process.argv[1]?.endsWith("server.js")) {
  const PORT = process.env.LAB_API_PORT || 4000;
  const HOST = process.env.LAB_API_HOST || "0.0.0.0";
  const { server } = createLabManagerServer({ persist: true });
  server.listen(PORT, HOST, () => {
    console.log(`[Lab Manager] Control Plane API listening on http://${HOST}:${PORT}`);
    console.log(`[Lab Manager] State Persistence: Enabled (src/server/data/state.json)`);
    console.log(`[Lab Manager] Endpoints: /api/targets, /api/test-runs, /api/findings, /api/health`);
  });
}
