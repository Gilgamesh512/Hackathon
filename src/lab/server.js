// Lab Manager Control Plane API Server
// Exposes REST APIs for Target Registry, Lifecycle Management, and Security Test Runs.

import http from "node:http";
import { TargetRegistry } from "./registry.js";
import { TargetLifecycleManager } from "./lifecycle.js";
import { TestEngine } from "./testEngine.js";

export function createLabManagerServer() {
  const registry = new TargetRegistry();
  registry.loadCatalog();

  const lifecycle = new TargetLifecycleManager(registry);
  const testEngine = new TestEngine(registry, lifecycle);

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
      // 1. Healthcheck
      if (pathname === "/api/health" && req.method === "GET") {
        return sendJson(200, {
          status: "healthy",
          component: "Lab Manager Control Plane",
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
        const run = await testEngine.runSecurityScan(body.targetId, body.profile || "automated-api");
        return sendJson(201, { message: "Security scan completed", run });
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

      // 10. GET /api/reports/:id
      if (pathname.startsWith("/api/reports/") && req.method === "GET") {
        const runId = pathname.replace("/api/reports/", "");
        const report = testEngine.generateReport(runId);
        if (!report) {
          return sendJson(404, { error: `Report for run '${runId}' not found.` });
        }
        return sendJson(200, { report });
      }

      sendJson(404, { error: "Endpoint not found" });
    } catch (err) {
      console.error("Lab API Error:", err);
      sendJson(500, { error: err.message });
    }
  });

  return { server, registry, lifecycle, testEngine };
}

// Standalone execution entrypoint
if (process.argv[1]?.endsWith("server.js")) {
  const PORT = process.env.LAB_API_PORT || 4000;
  const { server } = createLabManagerServer();
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[Lab Manager] Control Plane API listening on http://127.0.0.1:${PORT}`);
    console.log(`[Lab Manager] Endpoints: /api/targets, /api/test-runs, /api/findings, /api/health`);
  });
}
