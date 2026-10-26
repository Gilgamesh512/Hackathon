// Lab Test Engine & Evidence Verification System
// Executes authorized vulnerability checks, captures cryptographically anchored evidence,
// and computes scanner accuracy metrics (Precision, Recall, TP, FP, FN).

import crypto from "node:crypto";

function computeSha256(data) {
  return crypto.createHash("sha256").update(typeof data === "string" ? data : JSON.stringify(data)).digest("hex");
}

export class TestEngine {
  constructor(registry, lifecycle) {
    this.registry = registry;
    this.lifecycle = lifecycle;
    this.testRuns = new Map();
    this.findings = [];
    this.evidences = [];
  }

  /**
   * Dispatches a test run against an approved target
   */
  async runSecurityScan(targetId, profile = "automated-api") {
    // 1. Enforce Scope Whitelist
    if (!this.registry.isTargetInAuthorizedScope(targetId)) {
      throw new Error(`Scope Violation: Target '${targetId}' is not authorized for testing.`);
    }

    const target = this.registry.getTarget(targetId);
    const instance = await this.lifecycle.getTargetStatus(targetId);

    if (instance.status !== "running" || !instance.endpoint) {
      throw new Error(`Target '${targetId}' is not running. Please start target before scanning.`);
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const run = {
      id: runId,
      targetId,
      profile,
      status: "running",
      startedAt: new Date().toISOString(),
      findings: [],
    };
    this.testRuns.set(runId, run);

    // 2. Execute Tests Based on Target
    if (target.id === "custom-api-vault") {
      await this._scanCustomVaultApi(run, instance.endpoint);
    } else {
      // Generic mock / baseline scan for external targets
      await this._scanGenericBaseline(run, instance.endpoint);
    }

    run.status = "completed";
    run.finishedAt = new Date().toISOString();

    // 3. Compute Metrics (Ground Truth vs Findings)
    const metrics = this.computeMetrics(targetId, run.findings);
    run.metrics = metrics;

    return run;
  }

  async _scanCustomVaultApi(run, endpoint) {
    // Check 1: BOLA Vulnerability Check (Alice accesses Bob's medical record)
    try {
      // Step A: Login as Alice
      const loginRes = await fetch(`${endpoint}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice" }),
      });
      const loginData = await loginRes.json();
      const aliceToken = loginData.token;

      // Step B: Probe Bob's confidential record rec_102 with Alice's token
      const probeRes = await fetch(`${endpoint}/api/records/rec_102`, {
        method: "GET",
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      const probeData = await probeRes.json();

      if (probeRes.status === 200 && probeData.record && probeData.record.ownerId === "usr_bob") {
        const evidencePayload = {
          request: { method: "GET", path: "/api/records/rec_102", token: "Bearer [REDACTED_ALICE]" },
          response: { status: probeRes.status, body: probeData },
          observedAt: new Date().toISOString(),
        };

        const evidenceChecksum = computeSha256(evidencePayload);
        const evidenceId = `ev_${Date.now()}_1`;
        this.evidences.push({
          id: evidenceId,
          findingId: `fnd_${run.id}_bola`,
          checksum: evidenceChecksum,
          payload: evidencePayload,
        });

        const finding = {
          id: `fnd_${run.id}_bola`,
          runId: run.id,
          targetId: run.targetId,
          testKey: "BOLA-01",
          title: "Broken Object Level Authorization (BOLA / IDOR) on Medical Records",
          severity: "HIGH",
          confidence: "CONFIRMED",
          evidenceRef: evidenceId,
          checksum: evidenceChecksum,
          description: "Student Alice successfully retrieved student Bob's confidential medical note via GET /api/records/rec_102 without authorization.",
          status: "OPEN",
        };

        run.findings.push(finding);
        this.findings.push(finding);
      }
    } catch (err) {
      console.error("Error executing BOLA test check:", err);
    }

    // Check 2: Mass Assignment Privilege Escalation Check
    try {
      const loginRes = await fetch(`${endpoint}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice" }),
      });
      const { token } = await loginRes.json();

      const patchRes = await fetch(`${endpoint}/api/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: "admin", department: "Dean's Office" }),
      });
      const patchData = await patchRes.json();

      if (patchRes.status === 200 && patchData.escalated === true) {
        const evidencePayload = {
          request: { method: "POST", path: "/api/profile", payload: { role: "admin" } },
          response: patchData,
          observedAt: new Date().toISOString(),
        };

        const evidenceChecksum = computeSha256(evidencePayload);
        const evidenceId = `ev_${Date.now()}_2`;
        this.evidences.push({
          id: evidenceId,
          findingId: `fnd_${run.id}_mass_assign`,
          checksum: evidenceChecksum,
          payload: evidencePayload,
        });

        const finding = {
          id: `fnd_${run.id}_mass_assign`,
          runId: run.id,
          targetId: run.targetId,
          testKey: "MASS-ASSIGN-01",
          title: "Privilege Escalation via Insecure Mass Assignment in Profile Update",
          severity: "CRITICAL",
          confidence: "CONFIRMED",
          evidenceRef: evidenceId,
          checksum: evidenceChecksum,
          description: "Unprivileged student account escalated to 'admin' role by injecting 'role' field into profile payload.",
          status: "OPEN",
        };

        run.findings.push(finding);
        this.findings.push(finding);
      }
    } catch (err) {
      console.error("Error executing Mass Assignment check:", err);
    }
  }

  async _scanGenericBaseline(run, endpoint) {
    // Baseline passive check
    const finding = {
      id: `fnd_${run.id}_baseline`,
      runId: run.id,
      targetId: run.targetId,
      testKey: "BASELINE-01",
      title: "Target Service Responsive on Isolated Lab Network",
      severity: "INFO",
      confidence: "CONFIRMED",
      description: `Target instance verified reachable at ${endpoint}. Detailed scanner profile ready.`,
      status: "INFORMATIONAL",
    };
    run.findings.push(finding);
    this.findings.push(finding);
  }

  /**
   * Computes precision and recall against ground truth known expected findings
   * Section 8 Formula: Recall = TP / (TP + FN), Precision = TP / (TP + FP)
   */
  computeMetrics(targetId, detectedFindings) {
    const target = this.registry.getTarget(targetId);
    // Ground truth expected findings count (e.g. BOLA-01, MASS-ASSIGN-01 for custom target)
    const expectedKeys = ["BOLA-01", "MASS-ASSIGN-01"];
    const detectedKeys = detectedFindings.map((f) => f.testKey).filter(Boolean);

    let tp = 0;
    let fp = 0;

    for (const key of detectedKeys) {
      if (expectedKeys.includes(key)) {
        tp++;
      } else {
        fp++;
      }
    }

    const fn = Math.max(0, expectedKeys.length - tp);
    const precision = tp + fp > 0 ? (tp / (tp + fp)) : 0;
    const recall = tp + fn > 0 ? (tp / (tp + fn)) : 0;

    return {
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision: parseFloat(precision.toFixed(2)),
      recall: parseFloat(recall.toFixed(2)),
    };
  }

  getTestRun(runId) {
    return this.testRuns.get(runId) || null;
  }

  getAllFindings() {
    return this.findings;
  }

  getEvidence(evidenceId) {
    return this.evidences.find((e) => e.id === evidenceId) || null;
  }

  generateReport(runId) {
    const run = this.getTestRun(runId);
    if (!run) return null;

    const target = this.registry.getTarget(run.targetId);

    return {
      reportId: `rep_${run.id}`,
      generatedAt: new Date().toISOString(),
      target: {
        id: target?.id || run.targetId,
        name: target?.name || run.targetId,
        category: target?.category || [],
      },
      summary: {
        runId: run.id,
        status: run.status,
        duration: "Instantaneous In-Process",
        totalFindings: run.findings.length,
        criticalCount: run.findings.filter((f) => f.severity === "CRITICAL").length,
        highCount: run.findings.filter((f) => f.severity === "HIGH").length,
      },
      metrics: run.metrics || {},
      findings: run.findings,
    };
  }
}
