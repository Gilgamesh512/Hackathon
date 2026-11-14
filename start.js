// Intelligent Full-Stack Launcher for FairEnrol
// 1. Performs Environment & Dependency Pre-Flight Checks
// 2. Boots Backend Server Sequencer (Port 4000) & Frontend Vite (Port 5137)
// 3. Waits for services to become healthy
// 4. Automatically opens the default browser to http://localhost:5137
// 5. Handles graceful single-stroke shutdown (Ctrl + C)

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

console.log("\n==================================================================");
console.log("  🚀 FairEnrol Smart Launcher (Auto-Check & Auto-Open)            ");
console.log("==================================================================\n");

// --- STEP 1: PRE-FLIGHT ENVIRONMENT CHECKS ---
console.log("🔍 [1/4] Running Environment Pre-flight Verification...");

// 1.1 Node.js version check
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor < 18) {
  console.error(`❌ Incompatible Node.js version: v${process.versions.node}. Node.js >= 18 is required.`);
  process.exit(1);
}
console.log(`  ✓ Node.js version: v${process.versions.node} (Compatible)`);

// 1.2 Environment configuration check (.env.local)
const envLocalPath = path.resolve(process.cwd(), ".env.local");
const envExamplePath = path.resolve(process.cwd(), ".env.example");

if (!fs.existsSync(envLocalPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envLocalPath);
    console.log("  ✓ .env.local not found -> Automatically created from .env.example");
  } else {
    console.warn("  ⚠️ Warning: Neither .env.local nor .env.example found. Using defaults.");
  }
} else {
  console.log("  ✓ Environment configuration: .env.local is present");
}

// 1.3 Dependencies check (node_modules)
const nodeModulesPath = path.resolve(process.cwd(), "node_modules");
if (!fs.existsSync(nodeModulesPath)) {
  console.error("❌ node_modules directory missing. Please run 'npm install' first.");
  process.exit(1);
}
console.log("  ✓ Core dependencies: node_modules validated");

// --- STEP 2: START BACKEND SERVER SEQUENCER (PORT 4000) ---
console.log("\n⚙️  [2/4] Starting Backend Sequencer & Lab Plane (Port 4000)...");
const server = spawn("node", ["src/lab/server.js"], {
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
});

server.stdout.on("data", (data) => {
  const line = data.toString().trim();
  if (line) console.log(`  [Backend] ${line}`);
});

server.stderr.on("data", (data) => {
  const line = data.toString().trim();
  if (line) console.error(`  [Backend Error] ${line}`);
});

// --- STEP 3: START FRONTEND VITE DEV SERVER (PORT 5137) ---
console.log("🎨 [3/4] Starting Frontend Vite Dev Server (Port 5137)...");
const npmCmd = isWin ? "npm.cmd" : "npm";
const frontend = spawn(npmCmd, ["run", "dev"], {
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
});

frontend.stdout.on("data", (data) => {
  const line = data.toString().trim();
  if (line.includes("ready in") || line.includes("Local:") || line.includes("Network:")) {
    console.log(`  [Frontend] ${line}`);
  }
});

frontend.stderr.on("data", (data) => {
  const line = data.toString().trim();
  if (line && !line.includes("ExperimentalWarning")) {
    console.error(`  [Frontend Log] ${line}`);
  }
});

// Helper: Poll until HTTP endpoint responds
async function waitForEndpoint(url, maxAttempts = 30, delayMs = 300) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

// Helper: Open system browser cross-platform
function autoOpenBrowser(url) {
  console.log(`\n🌐 [4/4] Launching Browser to ${url}...`);

  // Detect headless environment (e.g. SSH session without X11/Wayland display)
  if (!isWin && !isMac && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    console.log(`  ℹ️  Headless terminal detected (No active GUI display).`);
    console.log(`  👉 Please open your browser from your host machine: ${url}\n`);
    return;
  }

  try {
    if (isWin) {
      spawn("cmd", ["/c", "start", url], { stdio: "ignore" });
    } else if (isMac) {
      spawn("open", [url], { stdio: "ignore" });
    } else {
      // Linux / Kali Linux GUI
      spawn("xdg-open", [url], { stdio: "ignore" });
    }
    console.log(`  ✓ Browser launched successfully!`);
  } catch (err) {
    console.log(`  ℹ️  Could not auto-launch browser. Please visit: ${url}`);
  }
}

// Orchestrate readiness & browser launch
async function init() {
  const backendReady = await waitForEndpoint("http://127.0.0.1:4000/api/health");
  if (!backendReady) {
    console.warn("  ⚠️ Warning: Backend healthcheck timed out, proceeding anyway.");
  } else {
    console.log("  ✓ Backend Sequencer is online and healthy (Port 4000)");
  }

  const frontendReady = await waitForEndpoint("http://127.0.0.1:5137/");
  if (!frontendReady) {
    console.warn("  ⚠️ Warning: Frontend dev server timed out, proceeding anyway.");
  } else {
    console.log("  ✓ Frontend UI is ready and serving (Port 5137)");
  }

  // Auto-launch the web page
  autoOpenBrowser("http://localhost:5137");

  console.log("\n==================================================================");
  console.log("  🟢 All Systems Live!");
  console.log("  • Web Application : http://localhost:5137");
  console.log("  • Sequencer API   : http://localhost:4000");
  console.log("  • Press Ctrl + C to stop all services simultaneously.");
  console.log("==================================================================\n");
}

init();

// Graceful multi-process shutdown
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n\n🛑 [FairEnrol] Gracefully stopping all services...");

  try {
    if (isWin) {
      if (server.pid) spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore" });
      if (frontend.pid) spawn("taskkill", ["/pid", String(frontend.pid), "/f", "/t"], { stdio: "ignore" });
    } else {
      server.kill("SIGTERM");
      frontend.kill("SIGTERM");
    }
  } catch {}

  setTimeout(() => {
    console.log("👋 All services terminated. See you next time!\n");
    process.exit(0);
  }, 400);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
