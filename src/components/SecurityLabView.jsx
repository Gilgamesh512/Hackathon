import { useState, useEffect } from "react";
import {
  getLabTargets,
  runSecurityScan,
  simulateExploitAttack,
  buildSarifDocument,
  buildSignedSarifDocument,
  verifySarifDocument,
  downloadJsonFile,
} from "../services/labClient";
import { subscribeCrossTab } from "../services/crossTabSync";
import { useKeycloak } from "../contexts/KeycloakContext";

export default function SecurityLabView() {
  const [targets, setTargets] = useState([]);
  const [isLiveServer, setIsLiveServer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedTargetId, setSelectedTargetId] = useState("custom-api-vault");

  const { triggerQuarantine } = useKeycloak();

  const [activeScanRun, setActiveScanRun] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  const [signedSarifDoc, setSignedSarifDoc] = useState(null);
  const [sarifVerificationResult, setSarifVerificationResult] = useState(null);
  const [isVerifyingSarif, setIsVerifyingSarif] = useState(false);

  const [selectedVector, setSelectedVector] = useState("BOLA_BOB_RECORD");
  const [exploitResult, setExploitResult] = useState(null);
  const [isExploiting, setIsExploiting] = useState(false);

  const [telemetryFeed, setTelemetryFeed] = useState([
    {
      id: "tel_init_01",
      timestamp: new Date(Date.now() - 300000).toISOString(),
      attackType: "CANARY_TOKEN_DEPLOYMENT",
      cwe: "CWE-200",
      owasp: "API1:2023",
      severity: "INFO",
      actor: "sec_ops",
      endpoint: "/api/records/rec_canary_999",
      method: "SYSTEM",
      payloadSummary: "Decoy Canary Token armed in Custom SecureVault",
      indicator: "Trapwire armed and active in Isolated Target Net.",
      evidenceChecksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
  ]);

  useEffect(() => {
    loadTargets();

    // Subscribe to cross-tab live exploit telemetry events
    const unsubscribe = subscribeCrossTab((msg) => {
      if (msg.type === "EXPLOIT_TELEMETRY" && msg.payload) {
        const item = {
          id: `tel_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          timestamp: msg.timestamp || new Date().toISOString(),
          ...msg.payload,
        };
        setTelemetryFeed((prev) => [item, ...prev]);
      }
    });

    return unsubscribe;
  }, []);

  async function loadTargets() {
    setLoading(true);
    try {
      const res = await getLabTargets();
      setTargets(res.targets);
      setIsLiveServer(res.isLive);
    } catch (err) {
      console.error("Failed to load lab targets:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteScan(targetId) {
    setIsScanning(true);
    setSelectedTargetId(targetId);
    try {
      const run = await runSecurityScan(targetId);
      setActiveScanRun(run);

      // Auto-inject findings into telemetry feed
      if (run.findings?.length > 0) {
        const newEvents = run.findings.map((f) => ({
          id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          attackType: f.testKey || "VULN_DISCOVERY",
          cwe: f.cwe || "CWE-284",
          owasp: f.owasp || "API1:2023",
          severity: f.severity,
          actor: "automated_scanner",
          endpoint: f.testKey === "BOLA-01" ? "/api/records/rec_102" : "/api/profile",
          method: f.testKey === "BOLA-01" ? "GET" : "POST",
          payloadSummary: f.description,
          indicator: `Vulnerability verified. Mathematical evidence SHA-256 anchored.`,
          evidenceChecksum: f.checksum,
        }));
        setTelemetryFeed((prev) => [...newEvents, ...prev]);
      }
    } catch (err) {
      alert(`Scan failed: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  }

  async function handleSimulateExploit() {
    setIsExploiting(true);
    setExploitResult(null);
    try {
      const res = await simulateExploitAttack(selectedVector);
      setExploitResult(res);

      if (res.capturedEvidence) {
        setTelemetryFeed((prev) => [res.capturedEvidence, ...prev]);
      }

      // Đề xuất 1: TideCloak Adaptive Active Defense Trigger
      if (selectedVector === "CANARY_TOKEN_TRIP" || res.capturedEvidence?.attackType?.includes("CANARY")) {
        triggerQuarantine({
          reason: "Canary Decoy Exfiltration Probe Tripped (rec_canary_999 / CWE-200)",
          threatLevel: "CRITICAL",
          actor: "Alice Walker (Simulated Attacker Account)",
          evidenceChecksum: res.capturedEvidence?.evidenceChecksum,
        });
      }
    } catch (err) {
      alert(`Exploit execution failed: ${err.message}`);
    } finally {
      setIsExploiting(false);
    }
  }

  async function handleExportSignedSarif() {
    if (!activeScanRun) return;
    const signed = await buildSignedSarifDocument(activeScanRun);
    setSignedSarifDoc(signed);
    downloadJsonFile(`fairenrol-scan-${activeScanRun.id}.sarif`, signed);
  }

  async function handleVerifySarifAttestation() {
    if (!activeScanRun) return;
    setIsVerifyingSarif(true);
    try {
      const docToVerify = signedSarifDoc || (await buildSignedSarifDocument(activeScanRun));
      if (!signedSarifDoc) setSignedSarifDoc(docToVerify);
      const res = await verifySarifDocument(docToVerify);
      setSarifVerificationResult(res);
    } finally {
      setIsVerifyingSarif(false);
    }
  }

  async function handleSimulateSarifTamper() {
    if (!activeScanRun) return;
    const baseDoc = signedSarifDoc || (await buildSignedSarifDocument(activeScanRun));
    if (!signedSarifDoc) setSignedSarifDoc(baseDoc);

    const tampered = JSON.parse(JSON.stringify(baseDoc));
    if (tampered.runs?.[0]?.results?.[0]) {
      // Malicious attacker attempts to conceal high-severity finding
      tampered.runs[0].results[0].level = "note";
      tampered.runs[0].results[0].message.text = "[NOTE] Suppressed finding";
    }
    const res = await verifySarifDocument(tampered);
    setSarifVerificationResult(res);
  }

  function handleExportFindingsJson() {
    if (!activeScanRun) return;
    downloadJsonFile(`fairenrol-findings-${activeScanRun.id}.json`, activeScanRun);
  }

  return (
    <div className="security-lab-container">
      {/* Platform Banner */}
      <div className="lab-hero-banner">
        <div className="lab-hero-content">
          <div className="lab-badge">
            <span className="live-dot" />
            {isLiveServer ? "CONTROL PLANE CONNECTED (PORT 4000)" : "IN-BROWSER CRYPTOGRAPHIC ENGINE"}
          </div>
          <h2>Security Lab & Vulnerability Telemetry Platform</h2>
          <p>
            An isolated dual-network honeypot and vulnerability benchmark. Harvests real-time exploitation traces,
            anchors forensic evidence via SHA-256 checksums, and evaluates security scanners with ground-truth precision &
            recall.
          </p>
        </div>

        <div className="lab-quick-actions">
          <button
            className="button primary"
            onClick={() => handleExecuteScan("custom-api-vault")}
            disabled={isScanning}
          >
            {isScanning ? "Scanning Target..." : "⚡ Run Live Benchmark Scan"}
          </button>
          <button className="button outline" onClick={loadTargets} title="Refresh target status">
            🔄 Refresh Registry
          </button>
        </div>
      </div>

      {/* Grid: Target Catalog & Benchmarking */}
      <div className="lab-grid-layout">
        {/* Left Column: Target Registry */}
        <div className="lab-card">
          <div className="card-header-row">
            <div>
              <h3>Target Registry Catalog (Scope Whitelist)</h3>
              <p className="card-subtitle">Approved targets quarantined on isolated Docker bridge network.</p>
            </div>
            <span className="count-pill">{targets.length} Targets</span>
          </div>

          <div className="target-list-scroll">
            {loading ? (
              <p className="muted-text">Loading catalog manifests...</p>
            ) : (
              targets.map((t) => {
                const isSelected = selectedTargetId === t.id;
                return (
                  <div
                    key={t.id}
                    className={`target-item-card ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedTargetId(t.id)}
                  >
                    <div className="target-card-top">
                      <strong className="target-title">{t.name}</strong>
                      <span className={`status-pill ${t.runtimeStatus?.status === "running" ? "online" : "idle"}`}>
                        {t.runtimeStatus?.status === "running" ? "● Active" : "○ Idle"}
                      </span>
                    </div>

                    <p className="target-desc">
                      {typeof t.description === "string" ? t.description : ""}
                    </p>

                    <div className="target-tags">
                      {Array.isArray(t.category) &&
                        t.category.map((cat) => (
                          <span key={cat} className="tag-chip">
                            {cat}
                          </span>
                        ))}
                      <span className="port-chip">
                        Port :{typeof t.port === "string" || typeof t.port === "number" ? t.port : (t.runtime?.defaultPort || "Docker")}
                      </span>
                    </div>

                    <div className="target-card-footer">
                      <button
                        className="button small primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExecuteScan(t.id);
                        }}
                        disabled={isScanning}
                      >
                        {isScanning && selectedTargetId === t.id ? "Scanning..." : "Scan Target"}
                      </button>
                      <small className="muted-text">
                        {(Array.isArray(t.groundTruthVulnerabilities)
                          ? t.groundTruthVulnerabilities.length
                          : (Array.isArray(t.testing?.expectedFindings)
                            ? t.testing.expectedFindings.length
                            : 2))} Known Vulnerabilities
                      </small>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Scan Results & Benchmark Metrics */}
        <div className="lab-card">
          <div className="card-header-row">
            <div>
              <h3>Scanner Accuracy Benchmark (Section 8)</h3>
              <p className="card-subtitle">Ground Truth Evaluation against known target vulnerabilities.</p>
            </div>
            {activeScanRun && (
              <div className="report-export-buttons" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button className="button small primary" onClick={handleExportSignedSarif} title="Download OASIS SARIF v2.1.0 with NIST ECDSA P-256 Attestation">
                  🔐 Export Signed SARIF (.sarif)
                </button>
                <button className="button small outline" onClick={handleExportFindingsJson}>
                  JSON Report
                </button>
              </div>
            )}
          </div>

          {activeScanRun ? (
            <div className="scan-results-box">
              {/* Metrics Summary Tiles */}
              <div className="metric-tiles-row">
                <div className="metric-tile success">
                  <span className="metric-num">{(activeScanRun.metrics.precision * 100).toFixed(0)}%</span>
                  <span className="metric-label">Precision (TP / TP+FP)</span>
                </div>
                <div className="metric-tile success">
                  <span className="metric-num">{(activeScanRun.metrics.recall * 100).toFixed(0)}%</span>
                  <span className="metric-label">Recall (TP / TP+FN)</span>
                </div>
                <div className="metric-tile">
                  <span className="metric-num">{activeScanRun.metrics.truePositives}</span>
                  <span className="metric-label">True Positives (TP)</span>
                </div>
                <div className="metric-tile">
                  <span className="metric-num">{activeScanRun.metrics.falsePositives}</span>
                  <span className="metric-label">False Positives (FP)</span>
                </div>
              </div>

              {/* Detected Findings */}
              <h4 style={{ marginTop: "20px", marginBottom: "10px" }}>
                Cryptographically Anchored Findings ({activeScanRun.findings?.length || 0})
              </h4>

              <div className="findings-scroll-list">
                {activeScanRun.findings?.map((f) => (
                  <div key={f.id} className={`finding-card ${f.severity.toLowerCase()}`}>
                    <div className="finding-top-bar">
                      <span className={`badge-severity ${f.severity.toLowerCase()}`}>{f.severity}</span>
                      <strong className="finding-title">{f.title}</strong>
                      <span className="confidence-pill">{f.confidence}</span>
                    </div>

                    <p className="finding-desc">{f.description}</p>

                    <div className="evidence-anchor-bar">
                      <span className="evidence-icon">🔒</span>
                      <span className="evidence-label">SHA-256 Evidence:</span>
                      <code className="evidence-hash">{f.checksum}</code>
                    </div>
                  </div>
                ))}
              </div>

              {/* Cryptographic SARIF Attestation Box */}
              <div
                className="sarif-attestation-card"
                style={{
                  marginTop: "20px",
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                    📜 Verifiable Cryptographic SARIF Attestation (NIST ECDSA P-256)
                  </strong>
                  <span
                    className="tag-crypto"
                    style={{ background: "#ecfdf5", color: "#065f46" }}
                  >
                    ECDSA-P256-SHA256
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    margin: "0 0 10px 0",
                  }}
                >
                  Binds scan findings and precision/recall metrics to the Control Plane's digital notary. Any manual edit to vulnerability results will invalidate the signature.
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "10px",
                  }}
                >
                  <button
                    className="button small primary"
                    onClick={handleVerifySarifAttestation}
                    disabled={isVerifyingSarif}
                  >
                    {isVerifyingSarif ? "Verifying ECDSA Signature…" : "🔍 Verify SARIF Attestation"}
                  </button>
                  <button
                    className="button small outline danger-outline"
                    onClick={handleSimulateSarifTamper}
                    disabled={isVerifyingSarif}
                    title="Simulates tampering with a finding severity to demonstrate detection"
                  >
                    ⚡ Simulate SARIF Tamper Attack (CWE-354)
                  </button>
                </div>

                {sarifVerificationResult && (
                  <div
                    className={`notice ${
                      sarifVerificationResult.valid
                        ? "crypto-success"
                        : "crypto-denied"
                    }`}
                    role="alert"
                    style={{ margin: 0, padding: "10px 14px" }}
                  >
                    {sarifVerificationResult.valid ? (
                      <div>
                        <strong>✓ SARIF Attestation Cryptographically Valid & Immutable</strong>
                        <div style={{ fontSize: "11px", marginTop: "4px" }}>
                          <span>
                            Signer: <strong>{sarifVerificationResult.signer}</strong>
                          </span>{" "}
                          ·{" "}
                          <span>
                            Thumbprint: <code>{sarifVerificationResult.signerThumbprint}</code>
                          </span>{" "}
                          ·{" "}
                          <span>
                            Canonical SHA-256:{" "}
                            <code>{sarifVerificationResult.canonicalSha256?.slice(0, 16)}…</code>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <strong>⛔ SARIF Attestation Signature Rejected (CWE-354 / CWE-347)</strong>
                        <p style={{ margin: "4px 0 0 0", fontSize: "12px" }}>
                          {sarifVerificationResult.error}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="scan-placeholder">
              <div className="placeholder-icon">🎯</div>
              <h4>No Active Scan Executed Yet</h4>
              <p>
                Click <strong>"Run Live Benchmark Scan"</strong> above or select a target from the registry to evaluate
                the engine and generate cryptographically verified vulnerability findings.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Exploit Telemetry Sensor & Interactive PoC Replayer */}
      <div className="lab-dual-section">
        {/* PoC Exploit Replayer */}
        <div className="lab-card flex-1">
          <div className="card-header-row">
            <div>
              <h3>Interactive PoC Exploit Playground</h3>
              <p className="card-subtitle">Fire verified exploits against the target to inspect live capture.</p>
            </div>
          </div>

          <div className="exploit-selector-row">
            <label className="input-label">Select Attack Vector:</label>
            <select
              className="select-field"
              value={selectedVector}
              onChange={(e) => setSelectedVector(e.target.value)}
            >
              <option value="BOLA_BOB_RECORD">BOLA / IDOR: Alice probes Bob's confidential medical note</option>
              <option value="MASS_ASSIGN_ADMIN">
                Mass Assignment: Elevate Alice role to 'admin' via unwhitelisted JSON
              </option>
              <option value="CANARY_TOKEN_TRIP">Canary Trapwire: Exfiltrate high-value decoy record</option>
            </select>
          </div>

          <div style={{ marginTop: "14px" }}>
            <button
              className="button danger"
              onClick={handleSimulateExploit}
              disabled={isExploiting}
              style={{ width: "100%" }}
            >
              {isExploiting ? "Transmitting Exploit Payload..." : "🚀 Transmit Exploit Payload to Target"}
            </button>
          </div>

          {exploitResult && (
            <div className="exploit-response-preview">
              <div className="exploit-response-header">
                <strong>Target Response (HTTP {exploitResult.status})</strong>
                <span className="status-pill online">EXPLOIT SUCCESSFUL</span>
              </div>
              <pre className="json-code-block">{JSON.stringify(exploitResult.responseBody, null, 2)}</pre>

              <div className="evidence-anchor-bar" style={{ marginTop: "8px" }}>
                <span>Forensic Hash:</span>
                <code className="evidence-hash">{exploitResult.capturedEvidence?.evidenceChecksum}</code>
              </div>
            </div>
          )}
        </div>

        {/* Live Exploit Telemetry Feed */}
        <div className="lab-card flex-1">
          <div className="card-header-row">
            <div>
              <h3>Live Exploit Telemetry & Honeypot Sensor</h3>
              <p className="card-subtitle">Real-time trace collection with OWASP/CWE classification.</p>
            </div>
            <span className="count-pill">{telemetryFeed.length} Events</span>
          </div>

          <div className="telemetry-feed-scroll">
            {telemetryFeed.map((event) => (
              <div key={event.id} className="telemetry-item">
                <div className="telemetry-time-row">
                  <span className="telemetry-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
                  <span className={`badge-severity ${event.severity?.toLowerCase() || "info"}`}>
                    {event.severity}
                  </span>
                  <span className="cwe-pill">{event.cwe}</span>
                  <span className="owasp-pill">{event.owasp}</span>
                </div>

                <div className="telemetry-detail-row">
                  <strong>{event.attackType}</strong>
                  <span className="telemetry-endpoint">
                    {event.method} {event.endpoint}
                  </span>
                </div>

                <p className="telemetry-indicator">{event.indicator}</p>

                <div className="telemetry-hash-row">
                  <small>Forensic Checksum:</small>
                  <code>{event.evidenceChecksum?.slice(0, 24)}…</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
