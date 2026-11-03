import { useState, useEffect } from "react";
import {
  getLabTargets,
  runSecurityScan,
  simulateExploitAttack,
  buildSarifDocument,
  downloadJsonFile,
} from "../services/labClient";
import { subscribeCrossTab } from "../services/crossTabSync";

export default function SecurityLabView() {
  const [targets, setTargets] = useState([]);
  const [isLiveServer, setIsLiveServer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedTargetId, setSelectedTargetId] = useState("custom-api-vault");

  const [activeScanRun, setActiveScanRun] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

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
    } catch (err) {
      alert(`Exploit execution failed: ${err.message}`);
    } finally {
      setIsExploiting(false);
    }
  }

  function handleExportSarif() {
    if (!activeScanRun) return;
    const sarif = buildSarifDocument(activeScanRun);
    downloadJsonFile(`fairenrol-scan-${activeScanRun.id}.sarif`, sarif);
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

                    <p className="target-desc">{t.description}</p>

                    <div className="target-tags">
                      {t.category?.map((cat) => (
                        <span key={cat} className="tag-chip">
                          {cat}
                        </span>
                      ))}
                      <span className="port-chip">Port :{t.port || "Docker"}</span>
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
                        {t.groundTruthVulnerabilities?.length || 2} Known Vulnerabilities
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
              <div className="report-export-buttons">
                <button className="button small outline" onClick={handleExportSarif} title="Download OASIS SARIF v2.1.0">
                  Export SARIF (.sarif)
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
