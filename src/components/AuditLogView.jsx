import { useState } from "react";
import { verifyAuditChain } from "../services/crypto";

export default function AuditLogView({ auditList, onTamper, onRestore, isTampered }) {
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  async function handleVerify() {
    setIsVerifying(true);
    setVerificationResult(null);

    // Minor delay for visual feedback
    await new Promise((r) => setTimeout(r, 350));

    const result = await verifyAuditChain(auditList);
    setVerificationResult(result);
    setIsVerifying(false);
  }

  return (
    <section className="section audit-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">MATHEMATICAL VERIFIABILITY</div>
          <h2>Cryptographic Hash-Chained Audit Trail</h2>
        </div>
        <div className="audit-controls">
          <button
            className="button outline verify-btn"
            onClick={handleVerify}
            disabled={isVerifying || auditList.length === 0}
          >
            {isVerifying ? "Verifying SHA-256 Chain…" : "Verify Ledger Integrity"}
          </button>
          {!isTampered ? (
            <button
              className="button outline danger-mini"
              onClick={onTamper}
              title="Simulate a database administrator secretly tampering with a past event"
            >
              Simulate DB Tampering
            </button>
          ) : (
            <button className="button quiet success-mini" onClick={onRestore}>
              Restore Clean Ledger
            </button>
          )}
          <span className="count-pill">{auditList.length} chained events</span>
        </div>
      </div>

      {verificationResult && (
        <div
          className={`notice chain-notice ${verificationResult.valid ? "valid-chain" : "tampered-chain"}`}
          role="status"
        >
          {verificationResult.valid ? (
            <div>
              <strong>✓ Cryptographic Chain Validated</strong>
              <p>
                All {verificationResult.verifiedCount} historical events verified against Genesis Block.
                Zero unauthorized modifications detected.
              </p>
            </div>
          ) : (
            <div>
              <strong>⛔ LEDGER TAMPERING DETECTED!</strong>
              <p>{verificationResult.error}</p>
              <small>
                A database record was modified without the required consensus hash chain.
              </small>
            </div>
          )}
          <button
            aria-label="Dismiss notice"
            onClick={() => setVerificationResult(null)}
          >
            ×
          </button>
        </div>
      )}

      {isTampered && !verificationResult && (
        <div className="demo-warning tamper-alert">
          <span>MALICIOUS TAMPER SIMULATED</span>
          A past audit record reason was secretly modified in memory. Click "Verify Ledger Integrity"
          to watch the SHA-256 chain detection algorithm catch the forgery.
        </div>
      )}

      <div className="audit-list">
        {auditList.map((entry) => (
          <div className="audit-row" key={entry.id}>
            <time>
              {new Date(entry.time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </time>
            <span
              className={`audit-dot ${entry.isTampered ? "tampered-dot" : ""}`}
              title={entry.isTampered ? "Tampered block" : "Valid block"}
            />
            <div className="audit-body">
              <div className="audit-title-row">
                <strong>{entry.action}</strong>
                {entry.hash && (
                  <span className="block-hash" title={`SHA-256: ${entry.hash}`}>
                    #hash:{entry.hash.slice(0, 10)}…
                  </span>
                )}
              </div>
              <p className={entry.isTampered ? "tampered-text" : ""}>{entry.reason}</p>
            </div>
            <span className="audit-actor">{entry.actor}</span>
          </div>
        ))}
        {auditList.length === 0 && (
          <p className="empty">Actions, approvals, denials and blocked attempts will appear here.</p>
        )}
      </div>
    </section>
  );
}
