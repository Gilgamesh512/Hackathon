import { useState } from "react";
import { verifyAuditChain } from "../services/crypto";
import { broadcastCrossTab } from "../services/crossTabSync";

export default function AuditProofVerifierModal({
  isOpen,
  onClose,
  currentLedger = [],
  currentCheckpoint = null,
}) {
  const [fileContent, setFileContent] = useState(null);
  const [fileName, setFileName] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [tamperedManually, setTamperedManually] = useState(false);

  if (!isOpen) return null;

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setFileContent(parsed);
      setTamperedManually(false);
      await executeVerification(parsed);
    } catch (err) {
      alert(`Invalid JSON format: ${err.message}`);
    }
  }

  function handleLoadCurrentLedger() {
    const activeData = {
      standard: "FairEnrol Cryptographic Audit Certificate v1.0",
      generatedAt: new Date().toISOString(),
      checkpointAnchorHash: currentCheckpoint,
      chainLength: currentLedger.length,
      auditLedger: currentLedger,
    };
    setFileName("active-portal-session.json");
    setFileContent(activeData);
    setTamperedManually(false);
    executeVerification(activeData);
  }

  async function executeVerification(data) {
    setIsVerifying(true);
    try {
      const ledger = data.auditLedger || data.audit || (Array.isArray(data) ? data : []);
      const checkpoint = data.checkpointAnchorHash || currentCheckpoint;

      const result = await verifyAuditChain(ledger, checkpoint);
      setVerificationResult({
        ...result,
        ledgerSize: ledger.length,
        checkpointUsed: checkpoint,
      });

      // Broadcast forensic telemetry
      broadcastCrossTab("EXPLOIT_TELEMETRY", {
        attackType: result.valid ? "AUDIT_PROOF_VERIFIED" : "AUDIT_TAMPER_DETECTED",
        cwe: result.valid ? "CWE-NONE" : "CWE-354",
        owasp: result.valid ? "A02:2021" : "A08:2021",
        severity: result.valid ? "INFO" : "CRITICAL",
        actor: "cryptographic_verifier",
        endpoint: "/api/audit/verify",
        method: "LOCAL_CRYPTO",
        payloadSummary: `Verified ${ledger.length} blocks against Checkpoint ${checkpoint?.slice(0, 10)}...`,
        indicator: result.valid
          ? "✓ CRYPTOGRAPHIC VERIFICATION PASSED: 100% hash linkage & checkpoint anchor sound."
          : `🚨 INTEGRITY VIOLATION: ${result.error}`,
        evidenceChecksum: result.headHash || "TAMPERED",
      });
    } catch (err) {
      setVerificationResult({
        valid: false,
        error: `Verification failed with exception: ${err.message}`,
      });
    } finally {
      setIsVerifying(false);
    }
  }

  function handleSimulateFileTamper() {
    if (!fileContent || !fileContent.auditLedger?.length) return;

    const modified = JSON.parse(JSON.stringify(fileContent));
    // Tamper with the reason or actor of the oldest block
    const targetBlock = modified.auditLedger[modified.auditLedger.length - 1];
    if (targetBlock) {
      targetBlock.reason = targetBlock.reason + " [MALICIOUS UNAUTHORIZED ALTERATION]";
    }
    setFileContent(modified);
    setTamperedManually(true);
    executeVerification(modified);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet verifier-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tour-modal-header">
          <div>
            <div className="tour-step-badge">
              STANDALONE AUDIT VERIFIER · ZERO-TRUST PROOF CHECKER
            </div>
            <h2>W3C Web Crypto Audit Proof Verifier</h2>
          </div>
          <button className="button-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <p className="section-desc" style={{ marginTop: "10px" }}>
          Upload any exported <code>.json</code> audit proof certificate to mathematically recalculate
          every SHA-256 block hash, verify strict chronological sequence links, and match against the
          independent Checkpoint Anchor without trusting this server.
        </p>

        {/* Action Toolbar */}
        <div className="verifier-upload-box">
          <div className="upload-btn-wrapper">
            <label className="button primary">
              📁 Choose Audit Certificate File (.json)
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </label>
            <button className="button outline" onClick={handleLoadCurrentLedger}>
              ⚡ Load Current Live Portal Ledger
            </button>
          </div>
          {fileName && <span className="file-pill">Loaded: {fileName}</span>}
        </div>

        {/* Active Inspection & Simulation */}
        {fileContent && (
          <div className="verifier-actions-row">
            <button
              className="button mini danger outline"
              onClick={handleSimulateFileTamper}
              disabled={tamperedManually}
            >
              🧪 Tamper 1 Character in Block #{fileContent.auditLedger?.length || 1}
            </button>
            {tamperedManually && (
              <span className="tamper-alert-pill">
                ⚠️ Malicious modification injected into JSON payload.
              </span>
            )}
          </div>
        )}

        {/* Verification Result Card */}
        {verificationResult && (
          <div
            className={`verification-status-banner ${
              verificationResult.valid ? "status-valid" : "status-tampered"
            }`}
          >
            <div className="status-banner-header">
              <span className="banner-icon">{verificationResult.valid ? "✓" : "⚠️"}</span>
              <div>
                <strong>
                  {verificationResult.valid
                    ? "CRYPTOGRAPHIC PROOF 100% VERIFIED AND UNTAMPERED"
                    : "TAMPERING OR CORRUPTION DETECTED IN AUDIT LEDGER"}
                </strong>
                <p>
                  {verificationResult.valid
                    ? `Successfully recalculated SHA-256 hashes across all ${verificationResult.verifiedCount} historical blocks. Independent Checkpoint Anchor matched.`
                    : verificationResult.error}
                </p>
              </div>
            </div>

            <div className="verifier-proof-stats">
              <div>
                <span>Blocks Checked:</span>
                <strong>{verificationResult.verifiedCount ?? verificationResult.ledgerSize}</strong>
              </div>
              <div>
                <span>Checkpoint Anchor:</span>
                <code>{verificationResult.checkpointUsed?.slice(0, 16)}...</code>
              </div>
              <div>
                <span>Calculated Head Hash:</span>
                <code>{verificationResult.headHash ? `${verificationResult.headHash.slice(0, 16)}...` : "CORRUPT"}</code>
              </div>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: "20px" }}>
          <button className="button outline" onClick={onClose}>
            Close Verifier
          </button>
        </div>
      </div>
    </div>
  );
}
