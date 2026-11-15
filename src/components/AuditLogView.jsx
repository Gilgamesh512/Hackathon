import { useState } from "react";
import {
  verifyAuditChain,
  generateAnchorNotarizationReceipt,
  verifyAnchorNotarizationReceipt,
} from "../services/crypto";
import { exportQueueIncidentSarif } from "../services/labClient";

export default function AuditLogView({
  auditList,
  checkpointHash,
  onTamperSingle,
  onTamperFullRewrite,
  onRestore,
  isTampered,
  tamperMode,
  onVerificationResultChange,
}) {
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [useAnchorVerification, setUseAnchorVerification] = useState(true);
  const [notarizationReceipt, setNotarizationReceipt] = useState(null);
  const [receiptVerification, setReceiptVerification] = useState(null);
  const [showNotarizationModal, setShowNotarizationModal] = useState(false);

  async function handleGenerateNotarization() {
    if (!checkpointHash) return;
    const receipt = await generateAnchorNotarizationReceipt(checkpointHash, auditList);
    setNotarizationReceipt(receipt);
    const verifyRes = await verifyAnchorNotarizationReceipt(receipt, checkpointHash);
    setReceiptVerification(verifyRes);
    setShowNotarizationModal(true);
  }

  async function handleVerifyNotarization() {
    if (!notarizationReceipt) return;
    const currentHead = auditList[0]?.hash;
    const verifyRes = await verifyAnchorNotarizationReceipt(notarizationReceipt, currentHead);
    setReceiptVerification(verifyRes);
  }

  function handleDownloadReceiptJson() {
    if (!notarizationReceipt) return;
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(notarizationReceipt, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `anchor-receipt-${notarizationReceipt.receiptId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  async function handleVerify() {
    setIsVerifying(true);
    setVerificationResult(null);

    await new Promise((r) => setTimeout(r, 350));

    const anchorToCheck = useAnchorVerification ? checkpointHash : null;
    const result = await verifyAuditChain(auditList, anchorToCheck);
    setVerificationResult(result);
    setIsVerifying(false);

    if (onVerificationResultChange) {
      onVerificationResultChange(result);
    }
  }

  function handleExportJson() {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(auditList, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `fairenrol-audit-ledger-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  return (
    <section className="section audit-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">MATHEMATICAL VERIFIABILITY & ANCHORED LEDGER</div>
          <h2>Cryptographic Hash-Chained Public Audit Trail</h2>
        </div>
        <div className="audit-controls">
          <button
            className="button outline verify-btn"
            onClick={handleVerify}
            disabled={isVerifying || auditList.length === 0}
          >
            {isVerifying ? "Verifying SHA-256 Chain…" : "Verify Ledger Integrity"}
          </button>

          <button
            className="button quiet mini"
            onClick={handleExportJson}
            title="Export verifiable canonical audit ledger as JSON"
          >
            📥 Export Ledger JSON
          </button>

          <button
            className="button outline mini export-sarif-btn"
            onClick={() => exportQueueIncidentSarif(auditList)}
            title="Export standard OASIS SARIF v2.1.0 security report for all blocked queue jumps and tamper events"
          >
            🛡️ Export Incidents SARIF (.sarif)
          </button>

          <button
            className="button outline mini"
            onClick={handleGenerateNotarization}
            title="Generate external OpenTimestamps / witness notarization proof for the Checkpoint Anchor"
          >
            🌐 Notarize Anchor (OTS Witness)
          </button>

          {!isTampered ? (
            <div className="tamper-button-group">
              <button
                className="button outline danger-mini"
                onClick={onTamperSingle}
                title="Simulate modifying a past event in mutable database"
              >
                Simulate Block Edit
              </button>
              <button
                className="button outline danger-mini"
                onClick={onTamperFullRewrite}
                title="Simulate attacker rewriting past block and re-computing all hashes (caught by Checkpoint Anchor)"
              >
                Simulate Full Chain Rewrite
              </button>
            </div>
          ) : (
            <button className="button quiet success-mini" onClick={onRestore}>
              Restore Clean Ledger
            </button>
          )}

          <span className="count-pill">{auditList.length} chained events</span>
        </div>
      </div>

      <p className="section-desc">
        Every enrolment, waitlist promotion, capacity adjustment, and 2-of-3 quorum vote produces a
        canonical SHA-256 block linked to its predecessor. An independent Checkpoint Anchor
        guarantees integrity even if a rogue system administrator attempts a full database recalculation.
      </p>

      {/* Anchor Checkpoint Status Pill */}
      {checkpointHash && (
        <div className="checkpoint-banner">
          <span className="checkpoint-icon">⚓</span>
          <div className="checkpoint-info">
            <strong>Independent Checkpoint Integrity Anchor:</strong>
            <code>{checkpointHash}</code>
          </div>
          <label className="anchor-checkbox-label">
            <input
              type="checkbox"
              checked={useAnchorVerification}
              onChange={(e) => setUseAnchorVerification(e.target.checked)}
            />
            Verify against External Anchor
          </label>
        </div>
      )}

      {/* Verification Notice */}
      {verificationResult && (
        <div
          className={`notice chain-notice ${verificationResult.valid ? "valid-chain" : "tampered-chain"}`}
          role="status"
        >
          {verificationResult.valid ? (
            <div>
              <strong>✓ Cryptographic Ledger Fully Validated</strong>
              <p>
                All {verificationResult.verifiedCount} historical events sequentially validated against Genesis Block.
                {useAnchorVerification && " Independent Checkpoint Anchor matched."} Zero unauthorized modifications detected.
              </p>
            </div>
          ) : (
            <div>
              <strong>⛔ LEDGER INTEGRITY BREACH DETECTED!</strong>
              <p>{verificationResult.error}</p>
              <small>
                Mathematical proof of tampering: Recomputed SHA-256 digest does not match recorded state or anchor checkpoint.
              </small>
            </div>
          )}
          <button
            aria-label="Dismiss notice"
            onClick={() => {
              setVerificationResult(null);
              if (onVerificationResultChange) onVerificationResultChange(null);
            }}
          >
            ×
          </button>
        </div>
      )}

      {isTampered && !verificationResult && (
        <div className="demo-warning tamper-alert">
          <span>MALICIOUS ATTACK SIMULATED ({tamperMode === "rewrite" ? "FULL REWRITE ATTACK" : "BLOCK EDIT ATTACK"})</span>
          {tamperMode === "rewrite"
            ? "Attacker secretly altered historical records AND recalculated all subsequent hashes. Click 'Verify Ledger Integrity' to watch the Independent Checkpoint Anchor catch the unauthorized rewrite."
            : "A historical database block was modified. Click 'Verify Ledger Integrity' to watch the SHA-256 cryptographic chain catch the alteration."}
        </div>
      )}

      {/* Audit Blocks List */}
      <div className="audit-list">
        {auditList.map((entry) => (
          <div className="audit-row" key={entry.id}>
            <div className="audit-seq-col">
              <span className="seq-badge">#{entry.seq ?? "—"}</span>
              <time>
                {new Date(entry.time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
            </div>

            <span
              className={`audit-dot ${entry.isTampered ? "tampered-dot" : ""}`}
              title={entry.isTampered ? "Tampered block" : "Valid block"}
            />

            <div className="audit-body">
              <div className="audit-title-row">
                <strong>{entry.action}</strong>
                <div className="hash-badges">
                  {entry.prevHash && (
                    <span className="prev-hash" title={`Parent Hash: ${entry.prevHash}`}>
                      parent:{entry.prevHash.slice(0, 8)}…
                    </span>
                  )}
                  {entry.hash && (
                    <span className="block-hash" title={`SHA-256 Digest: ${entry.hash}`}>
                      hash:{entry.hash.slice(0, 10)}…
                    </span>
                  )}
                </div>
              </div>
              <p className={entry.isTampered ? "tampered-text" : ""}>{entry.reason}</p>
              {entry.details && Object.keys(entry.details).length > 0 && (
                <div className="entry-details-meta">
                  {Object.entries(entry.details).map(([k, v]) => (
                    <span key={k} className="detail-tag">
                      {k}: <code>{String(v)}</code>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span className="audit-actor">{entry.actor}</span>
          </div>
        ))}

        {auditList.length === 0 && (
          <p className="empty">Actions, approvals, denials and promotions will appear here.</p>
        )}
      </div>

      {showNotarizationModal && notarizationReceipt && (
        <div className="modal-overlay" onClick={() => setShowNotarizationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
            <div className="modal-header">
              <h3>🌐 External Checkpoint Anchor Notarization Receipt</h3>
              <button className="button quiet mini" onClick={() => setShowNotarizationModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "1rem" }}>
                This receipt cryptographically notarizes the current FairEnrol Checkpoint Anchor with an external public timestamping witness, eliminating single-institution trust.
              </p>

              <div style={{ background: "rgba(15, 23, 42, 0.7)", borderRadius: "6px", padding: "12px", border: "1px solid rgba(255, 255, 255, 0.1)", marginBottom: "1rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px", fontSize: "0.85rem" }}>
                  <strong>Receipt ID:</strong>
                  <code>{notarizationReceipt.receiptId}</code>

                  <strong>Status:</strong>
                  <span style={{ color: "#4ade80", fontWeight: "bold" }}>● {notarizationReceipt.status}</span>

                  <strong>Protocol:</strong>
                  <span>{notarizationReceipt.anchorProtocol}</span>

                  <strong>Anchored Hash:</strong>
                  <code style={{ wordBreak: "break-all" }}>{notarizationReceipt.checkpointHash}</code>

                  <strong>Canonical Merkle Root:</strong>
                  <code style={{ wordBreak: "break-all" }}>{notarizationReceipt.canonicalMerkleRoot}</code>

                  <strong>Block Count:</strong>
                  <span>{notarizationReceipt.blockCount} blocks</span>

                  <strong>Notarized At:</strong>
                  <span>{notarizationReceipt.notarizedAt}</span>

                  <strong>Witness Signature:</strong>
                  <code style={{ wordBreak: "break-all" }}>{notarizationReceipt.witnessProof}</code>
                </div>
              </div>

              {receiptVerification && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    marginBottom: "1rem",
                    background: receiptVerification.valid ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    border: `1px solid ${receiptVerification.valid ? "#22c55e" : "#ef4444"}`,
                    color: receiptVerification.valid ? "#86efac" : "#fca5a5",
                    fontSize: "0.9rem",
                  }}
                >
                  {receiptVerification.valid ? (
                    <span>✓ Mathematical Notarization Verified: Witness commitment matches current ledger head perfectly.</span>
                  ) : (
                    <span>⛔ Verification Failure: {receiptVerification.error}</span>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button className="button outline mini" onClick={handleVerifyNotarization}>
                  ↻ Re-verify Against Chain Head
                </button>
                <button className="button dark mini" onClick={handleDownloadReceiptJson}>
                  📥 Download Receipt (.json)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
