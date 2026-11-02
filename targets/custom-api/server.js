// Deliberately Vulnerable Micro-Target: Custom SecureVault API
// Designed for Security Lab Scanner Evaluation and Penetration Testing
// Flaws: BOLA (Broken Object Level Authorization), Mass Assignment, Missing Rate Limit.
// Telemetry: Live Exploit Sensor, Canary Decoy Exfiltration Traps, Cryptographic Evidence.

import http from "node:http";
import crypto from "node:crypto";

function computeSha256(data) {
  return crypto.createHash("sha256").update(typeof data === "string" ? data : JSON.stringify(data)).digest("hex");
}

const INITIAL_USERS = [
  { id: "usr_alice", username: "alice", role: "student", token: "tok_alice_123" },
  { id: "usr_bob", username: "bob", role: "student", token: "tok_bob_456" },
  { id: "usr_admin", username: "admin", role: "admin", token: "tok_admin_789" },
];

const INITIAL_RECORDS = [
  {
    id: "rec_101",
    ownerId: "usr_alice",
    studentName: "Alice Walker",
    medicalException: "Documented visual accommodation for Exam Hall C",
    classification: "CONFIDENTIAL_MEDICAL",
  },
  {
    id: "rec_102",
    ownerId: "usr_bob",
    studentName: "Bob Smith",
    medicalException: "Documented anxiety disorder accommodation, private room",
    classification: "CONFIDENTIAL_MEDICAL",
  },
  {
    id: "rec_canary_999",
    ownerId: "usr_canary",
    studentName: "CANARY_TOKEN_DEAN",
    medicalException: "TRAPWIRE_CANARY: High-value confidential record. Access indicates exfiltration probe!",
    classification: "TOP_SECRET_CANARY",
  },
];

let users = JSON.parse(JSON.stringify(INITIAL_USERS));
let records = JSON.parse(JSON.stringify(INITIAL_RECORDS));
let telemetryLogs = [];

export function resetState() {
  users = JSON.parse(JSON.stringify(INITIAL_USERS));
  records = JSON.parse(JSON.stringify(INITIAL_RECORDS));
  telemetryLogs = [];
}

export function getTelemetryLogs() {
  return telemetryLogs;
}

export function recordTelemetryEvent(event) {
  const timestamp = new Date().toISOString();
  const checksum = computeSha256({ ...event, timestamp });
  const entry = {
    id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp,
    ...event,
    evidenceChecksum: checksum,
  };
  telemetryLogs.unshift(entry);
  if (telemetryLogs.length > 50) telemetryLogs.pop();
  return entry;
}

export function createCustomApiServer() {
  const server = http.createServer(async (req, res) => {
    // Enable CORS for testing
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const currentUser = users.find((u) => u.token === token);

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

    // 1. Healthcheck
    if (url.pathname === "/api/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", target: "custom-api-vault", version: "1.0.0" }));
      return;
    }

    // 2. Reset Endpoint
    if (url.pathname === "/api/reset" && req.method === "POST") {
      resetState();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "reset_successful", recordsCount: records.length }));
      return;
    }

    // 3. User Login Simulation
    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const { username } = await readBody();
      const user = users.find((u) => u.username === username);
      if (!user) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid credentials" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ token: user.token, user }));
      return;
    }

    // 4. Vulnerable BOLA Endpoint: GET /api/records/:id
    // FLAWS: Validates that a token exists, but DOES NOT check if record.ownerId === currentUser.id!
    if (url.pathname.startsWith("/api/records/") && req.method === "GET") {
      if (!currentUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: Missing or invalid token" }));
        return;
      }

      const recordId = url.pathname.replace("/api/records/", "");
      const rec = records.find((r) => r.id === recordId);
      if (!rec) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Record not found" }));
        return;
      }

      // VULNERABILITY (BOLA/IDOR): Alice can access Bob's or Canary medical record!
      const isCanary = rec.id === "rec_canary_999";
      const isBola = rec.ownerId !== currentUser.id;

      if (isCanary) {
        recordTelemetryEvent({
          attackType: "CANARY_TOKEN_EXFILTRATION",
          cwe: "CWE-200",
          owasp: "API1:2023",
          severity: "CRITICAL",
          actor: currentUser.username,
          endpoint: url.pathname,
          method: "GET",
          payloadSummary: `Exfiltrated Canary Record '${rec.id}'`,
          indicator: "Trapwire tripped: unauthorized read of high-value decoy record.",
        });
      } else if (isBola) {
        recordTelemetryEvent({
          attackType: "BOLA_EXPLOITATION",
          cwe: "CWE-284",
          owasp: "API1:2023",
          severity: "HIGH",
          actor: currentUser.username,
          endpoint: url.pathname,
          method: "GET",
          payloadSummary: `Accessed record '${rec.id}' belonging to '${rec.ownerId}'`,
          indicator: "Authorization bypass: record ownerId mismatch with token holder.",
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          record: rec,
          accessWarning:
            isCanary
              ? "TRAPWIRE_ALERT: Canary token accessed! Telemetry sensor captured forensic snapshot."
              : isBola
              ? "SECURITY_ALERT: BOLA vulnerability exploited! User accessed record belonging to another student."
              : undefined,
        })
      );
      return;
    }

    // 5. Vulnerable Mass Assignment: POST /api/profile
    // FLAWS: Directly assigns user input properties onto the user object without whitelist!
    if (url.pathname === "/api/profile" && req.method === "POST") {
      if (!currentUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const payload = await readBody();
      const prevRole = currentUser.role;
      // VULNERABILITY: Object.assign allows overriding 'role' to 'admin'
      Object.assign(currentUser, payload);

      if (payload.role && payload.role !== prevRole) {
        recordTelemetryEvent({
          attackType: "MASS_ASSIGNMENT_PRIV_ESC",
          cwe: "CWE-915",
          owasp: "API3:2023",
          severity: "CRITICAL",
          actor: currentUser.username,
          endpoint: "/api/profile",
          method: "POST",
          payloadSummary: JSON.stringify(payload),
          indicator: `Role escalated from '${prevRole}' to '${currentUser.role}' via mass assignment.`,
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message: "Profile updated",
          profile: currentUser,
          escalated: currentUser.role === "admin",
        })
      );
      return;
    }

    // 6. GET /api/telemetry - Live exploit sensor telemetry feed
    if (url.pathname === "/api/telemetry" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ telemetry: getTelemetryLogs(), total: telemetryLogs.length }));
      return;
    }

    // 7. POST /api/simulate-attack - Interactive exploit simulator endpoint
    if (url.pathname === "/api/simulate-attack" && req.method === "POST") {
      const { vector, payload } = await readBody();

      let outcome = {};
      if (vector === "BOLA_BOB_RECORD") {
        const alice = users.find((u) => u.username === "alice");
        const bobRec = records.find((r) => r.id === "rec_102");
        const tel = recordTelemetryEvent({
          attackType: "BOLA_EXPLOITATION",
          cwe: "CWE-284",
          owasp: "API1:2023",
          severity: "HIGH",
          actor: "alice",
          endpoint: "/api/records/rec_102",
          method: "GET",
          payloadSummary: "Target ID: rec_102",
          indicator: "Alice obtained Bob's confidential medical accommodations.",
        });
        outcome = {
          success: true,
          status: 200,
          vector,
          capturedEvidence: tel,
          responseBody: { record: bobRec, warning: "BOLA exploited: cross-tenant read" },
        };
      } else if (vector === "MASS_ASSIGN_ADMIN") {
        const alice = users.find((u) => u.username === "alice");
        alice.role = "admin";
        const tel = recordTelemetryEvent({
          attackType: "MASS_ASSIGNMENT_PRIV_ESC",
          cwe: "CWE-915",
          owasp: "API3:2023",
          severity: "CRITICAL",
          actor: "alice",
          endpoint: "/api/profile",
          method: "POST",
          payloadSummary: JSON.stringify(payload || { role: "admin" }),
          indicator: "Privilege escalation: student role upgraded to admin.",
        });
        outcome = {
          success: true,
          status: 200,
          vector,
          capturedEvidence: tel,
          responseBody: { message: "Profile updated", profile: alice, escalated: true },
        };
      } else if (vector === "CANARY_TOKEN_TRIP") {
        const canary = records.find((r) => r.id === "rec_canary_999");
        const tel = recordTelemetryEvent({
          attackType: "CANARY_TOKEN_EXFILTRATION",
          cwe: "CWE-200",
          owasp: "API1:2023",
          severity: "CRITICAL",
          actor: "attacker_probe",
          endpoint: "/api/records/rec_canary_999",
          method: "GET",
          payloadSummary: "Trapwire token queried",
          indicator: "Decoy trapwire tripped: Exfiltration alert broadcasted to SOC.",
        });
        outcome = {
          success: true,
          status: 200,
          vector,
          capturedEvidence: tel,
          responseBody: { record: canary, trapwireAlert: "Exfiltration signature captured" },
        };
      } else {
        outcome = {
          success: false,
          status: 400,
          error: "Unknown attack vector. Supported: BOLA_BOB_RECORD, MASS_ASSIGN_ADMIN, CANARY_TOKEN_TRIP",
        };
      }

      res.writeHead(outcome.status || 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(outcome));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return server;
}

// Direct execution support
if (process.argv[1]?.endsWith("server.js")) {
  const PORT = process.env.TARGET_PORT || 4100;
  const server = createCustomApiServer();
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[Custom Target] Vulnerable Vault API listening on http://127.0.0.1:${PORT}`);
  });
}
