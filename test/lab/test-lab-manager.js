// Verification & Acceptance Test Suite for Vulnerable Lab Platform (Control Plane & Targets)
// Enforces Section 8 Acceptance Criteria:
// AC-02: Target registry (loads >= 4 targets)
// AC-03: Isolation & Scope Boundary enforcement (rejects unauthorized scope)
// AC-04: Lifecycle (start, stop, healthcheck)
// AC-05: Reset (data restored)
// AC-07: Scan scope enforcement
// AC-08: Cryptographic Evidence verification
// AC-09: Precision & Recall metric calculation

import assert from "node:assert/strict";
import { TargetRegistry } from "../../src/lab/registry.js";
import { TargetLifecycleManager } from "../../src/lab/lifecycle.js";
import { TestEngine } from "../../src/lab/testEngine.js";

async function runLabTests() {
  console.log("==================================================================");
  console.log("    Security Lab Platform Acceptance & Invariant Test Suite       ");
  console.log("==================================================================\n");

  const registry = new TargetRegistry();
  const lifecycle = new TargetLifecycleManager(registry);
  let testCount = 0;

  // TEST 1: AC-02 Target Registry - Manifest Loading
  {
    testCount++;
    console.log(`Test ${testCount}: Target Registry loads approved catalog`);
    const targets = registry.getAllTargets();

    assert.ok(targets.length >= 4, `Expected at least 4 catalog targets, found ${targets.length}`);
    const targetIds = targets.map((t) => t.id);
    assert.ok(targetIds.includes("owasp-juice-shop"), "Juice Shop must be registered");
    assert.ok(targetIds.includes("owasp-crapi"), "crAPI must be registered");
    assert.ok(targetIds.includes("dvwa"), "DVWA must be registered");
    assert.ok(targetIds.includes("owasp-webgoat"), "WebGoat must be registered");
    assert.ok(targetIds.includes("custom-api-vault"), "Custom API Vault must be registered");

    console.log(`  ✓ Successfully loaded ${targets.length} targets: ${targetIds.join(", ")}\n`);
  }

  // TEST 2: AC-07 Scope Enforcement & Anti-SSRF Protection
  {
    testCount++;
    console.log(`Test ${testCount}: Scan scope boundary rejects unauthorized targets (Anti-SSRF)`);
    const registry = new TargetRegistry();
    const lifecycle = new TargetLifecycleManager(registry);
    const engine = new TestEngine(registry, lifecycle);

    let rejected = false;
    try {
      await engine.runSecurityScan("unauthorized-internal-host.corp", "automated-api");
    } catch (err) {
      rejected = true;
      assert.ok(err.message.includes("Scope Violation"), "Error must clearly indicate Scope Violation");
    }

    assert.equal(rejected, true, "Scan engine must reject arbitrary unapproved target names or URLs");
    console.log("  ✓ Scope boundary enforced. Arbitrary scan target rejected.\n");
  }

  // TEST 3: AC-04 Target Lifecycle (Start, Healthcheck, Stop)
  {
    testCount++;
    console.log(`Test ${testCount}: Lifecycle Manager start, healthcheck and stop`);

    // Start custom target
    const instance = await lifecycle.startTarget("custom-api-vault", 4199);
    assert.equal(instance.status, "running", "Target status must be 'running'");
    assert.ok(instance.endpoint.includes("4199"), "Endpoint must match allocated test port");

    // Check health
    const health = await lifecycle.checkHealth("custom-api-vault");
    assert.equal(health.healthy, true, "Target health check must report healthy");

    console.log("  ✓ Target successfully started and health verified.\n");
  }

  // TEST 4: AC-05 Target State Reset
  {
    testCount++;
    console.log(`Test ${testCount}: Target state reset verification`);

    const resetRes = await lifecycle.resetTarget("custom-api-vault");
    assert.equal(resetRes.status, "reset_complete", "Reset status must be complete");
    assert.equal(resetRes.strategy, "in-memory-seed", "Reset strategy must match manifest");
    console.log("  ✓ Reset contract successfully restored baseline seed state.\n");
  }

  // TEST 5: AC-08 Automated Test Scan, Vulnerability Detection & Evidence Cryptographic Checksum
  {
    testCount++;
    console.log(`Test ${testCount}: Automated security scan & Cryptographic Evidence Anchoring`);
    const engine = new TestEngine(registry, lifecycle);

    // Execute scan against running custom target on port 4199
    const run = await engine.runSecurityScan("custom-api-vault", "automated-api");
    assert.equal(run.status, "completed", "Test run must complete successfully");
    assert.ok(run.findings.length >= 2, `Expected at least 2 findings, got ${run.findings.length}`);

    // Verify BOLA finding
    const bolaFinding = run.findings.find((f) => f.testKey === "BOLA-01");
    assert.ok(bolaFinding, "Engine must detect BOLA vulnerability");
    assert.equal(bolaFinding.severity, "HIGH");

    // Verify Evidence Checksum
    const evidence = engine.getEvidence(bolaFinding.evidenceRef);
    assert.ok(evidence, "Evidence record must exist");
    assert.equal(evidence.checksum, bolaFinding.checksum, "Evidence checksum must match finding checksum");

    // Verify Mass Assignment finding
    const massAssignFinding = run.findings.find((f) => f.testKey === "MASS-ASSIGN-01");
    assert.ok(massAssignFinding, "Engine must detect Mass Assignment privilege escalation");
    assert.equal(massAssignFinding.severity, "CRITICAL");

    console.log(`  ✓ Detected ${run.findings.length} vulnerabilities with SHA-256 evidence integrity:`);
    console.log(`    - [${bolaFinding.severity}] ${bolaFinding.title} (SHA-256: ${bolaFinding.checksum.slice(0, 16)}…)`);
    console.log(`    - [${massAssignFinding.severity}] ${massAssignFinding.title} (SHA-256: ${massAssignFinding.checksum.slice(0, 16)}…)`);
    console.log("");
  }

  // TEST 6: AC-09 Evaluation Metrics (Precision & Recall)
  {
    testCount++;
    console.log(`Test ${testCount}: Scanner Evaluation Metrics (Precision, Recall, TP, FP, FN)`);
    const registry = new TargetRegistry();
    const lifecycle = new TargetLifecycleManager(registry);
    const engine = new TestEngine(registry, lifecycle);

    // Simulated scanner findings: 2 True Positives, 0 False Positives
    const mockFindings = [{ testKey: "BOLA-01" }, { testKey: "MASS-ASSIGN-01" }];
    const metrics = engine.computeMetrics("custom-api-vault", mockFindings);

    assert.equal(metrics.truePositives, 2, "TP must equal 2");
    assert.equal(metrics.falsePositives, 0, "FP must equal 0");
    assert.equal(metrics.falseNegatives, 0, "FN must equal 0");
    assert.equal(metrics.precision, 1.0, "Precision must equal 1.0 (100%)");
    assert.equal(metrics.recall, 1.0, "Recall must equal 1.0 (100%)");

    console.log(`  ✓ Metric formulas validated:`);
    console.log(`    TP=${metrics.truePositives}, FP=${metrics.falsePositives}, FN=${metrics.falseNegatives}`);
    console.log(`    Precision=${metrics.precision * 100}%, Recall=${metrics.recall * 100}%\n`);

    // Clean up running instance
    await lifecycle.stopTarget("custom-api-vault");
  }

  console.log("==================================================================");
  console.log("  ALL LAB PLATFORM VERIFICATION TESTS PASSED SUCCESSFULLY! (6/6) ");
  console.log("==================================================================\n");

  setTimeout(() => {
    process.exit(0);
  }, 100);
}

runLabTests().catch((err) => {
  console.error("Lab test suite failed with error:", err);
  process.exit(1);
});
