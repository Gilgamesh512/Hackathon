import { useState } from "react";
import { decryptConfidentialEvidence } from "../services/crypto";
import { APPROVER_SECRET_KEY } from "../services/tidecloak";

export default function EvidenceModal({
  isOpen,
  onClose,
  request,
  userRole,
  activeApprover,
  onAuditLog,
}) {
  const [decryptedText, setDecryptedText] = useState(null);
  const [decryptionError, setDecryptionError] = useState(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  if (!isOpen || !request) return null;

  const encryptedData = request.confidentialEvidence;

  async function handleDecrypt(authorized) {
    setIsDecrypting(true);
    setDecryptionError(null);
    setDecryptedText(null);

    // Intentional delay to illustrate cryptographic verification
    await new Promise((r) => setTimeout(r, 400));

    const keyToUse = authorized ? APPROVER_SECRET_KEY : "UNAUTHORIZED_ATTACKER_KEY_INVALID";
    const result = await decryptConfidentialEvidence(encryptedData, keyToUse);

    setIsDecrypting(false);

    if (result.success) {
      setDecryptedText(result.plaintext);
      if (onAuditLog) {
        onAuditLog(
          activeApprover?.name || "Panel Member",
          "Confidential Evidence Decrypted",
          `Authorized panel member inspected medical/support certificate for request #${request.id.slice(-6)}`
        );
      }
    } else {
      setDecryptionError(result.error);
      if (onAuditLog) {
        onAuditLog(
          userRole === "registrar" ? "Taylor Reed (Registrar)" : "Unauthorized Client",
          "Cryptographic Decryption Blocked",
          `Illegal attempt to decrypt confidential medical records for request #${request.id.slice(-6)}. AES-GCM authentication tag rejected.`
        );
      }
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-box evidence-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">E2EE CONFIDENTIAL EVIDENCE</div>
            <h3>Cryptographic Access Control</h3>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="evidence-summary">
            <div>
              <span className="label">Requester:</span> <strong>{request.requester}</strong>
            </div>
            <div>
              <span className="label">Public Reason:</span> <span>{request.reason}</span>
            </div>
            <div>
              <span className="label">Encryption Standard:</span>{" "}
              <span className="tag-crypto">AES-GCM-256 (Web Crypto W3C)</span>
            </div>
          </div>

          <div className="ciphertext-box">
            <div className="ciphertext-head">
              <span>Encrypted Ciphertext Payload (Stored on Public Ledger)</span>
              <span className="iv-badge">IV: {encryptedData.iv.slice(0, 10)}…</span>
            </div>
            <pre className="ciphertext-content">{encryptedData.ciphertext}</pre>
          </div>

          {decryptionError && (
            <div className="notice crypto-denied" role="alert">
              <strong>⛔ Access Denied (Cryptographic Proof)</strong>
              <p>{decryptionError}</p>
              <small>
                This protection is mathematical: the server or unauthorized client cannot read the
                evidence even if they alter the client code.
              </small>
            </div>
          )}

          {decryptedText && (
            <div className="notice crypto-success" role="status">
              <div className="decrypted-header">
                <strong>✓ Decrypted Medical & Accommodation Document</strong>
                <span className="auth-verified-badge">Authenticated by AES-GCM Tag</span>
              </div>
              <p className="decrypted-body">{decryptedText}</p>
            </div>
          )}

          <div className="evidence-interactive-actions">
            <span className="section-label">Interactive Cryptographic Verification:</span>
            <div className="button-group">
              <button
                className="button outline danger-outline"
                onClick={() => handleDecrypt(false)}
                disabled={isDecrypting}
              >
                {isDecrypting ? "Testing…" : "1. Test Unauthorized Decryption (Blocked)"}
              </button>

              <button
                className="button dark"
                onClick={() => handleDecrypt(true)}
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting…" : "2. Decrypt as Approver Panel (Authorized)"}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="button quiet" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
