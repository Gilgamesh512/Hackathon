// Deliberately Vulnerable Micro-Target: Custom SecureVault API
// Designed for Security Lab Scanner Evaluation and Penetration Testing
// Flaws: BOLA (Broken Object Level Authorization), Mass Assignment, Missing Rate Limit.

import http from "node:http";

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
];

let users = JSON.parse(JSON.stringify(INITIAL_USERS));
let records = JSON.parse(JSON.stringify(INITIAL_RECORDS));

export function resetState() {
  users = JSON.parse(JSON.stringify(INITIAL_USERS));
  records = JSON.parse(JSON.stringify(INITIAL_RECORDS));
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

      // VULNERABILITY (BOLA/IDOR): Alice can access Bob's medical record!
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          record: rec,
          accessWarning:
            rec.ownerId !== currentUser.id
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
      // VULNERABILITY: Object.assign allows overriding 'role' to 'admin'
      Object.assign(currentUser, payload);

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
