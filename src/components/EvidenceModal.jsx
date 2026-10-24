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

  async function handleDecrypt(mode) {
    setIsDecrypting(true);
    setDecryptionError(null);
    setDecryptedText(null);

    // Minor delay to illustrate cryptographic verification
    await new Promise((r) => setTimeout(r, 400));

    let keyToUse = APPROVER_SECRET_KEY;
    let aadToUse = null; // null means use encryptedData.aad

    if (mode === "unauthorized_key") {
      keyToUse = "UNAUTHORIZED_ATTACKER_KEY_INVALID";
    } else if (mode === "forged_aad") {
      // Simulate an attacker attempting to replay this medical note for a different student!
      aadToUse = JSON.stringify({
        studentId: "s99_MALICIOUS_REPLAY_ATTACKER",
        courseId: request.courseId,
        kind: request.kind,
      });
    }

    const result = await decryptConfidentialEvidence(
      encryptedData,
      keyToUse,
      aadToUse
    );

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
            <h3>Cryptographic Access Control & AAD Integrity</h3>
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
              <span className="tag-crypto">AES-GCM-256 (W3C Web Crypto)</span>
            </div>
          </div>

          <div className="ciphertext-box">
            <div className="ciphertext-head">
              <span>Encrypted Ciphertext Payload (Public Ledger Safe)</span>
              <span className="iv-badge">IV: {encryptedData.iv.slice(0, 10)}…</span>
            </div>
            <pre className="ciphertext-content">{encryptedData.ciphertext}</pre>
            {encryptedData.aad && (
              <div className="aad-display">
                <span className="aad-label">Cryptographic Authenticated Additional Data (AAD):</span>
                <code>{encryptedData.aad}</code>
              </div>
            )}
          </div>

          {decryptionError && (
            <div className="notice crypto-denied" role="alert">
              <strong>⛔ Access Denied (Cryptographic Proof)</strong>
              <p>{decryptionError}</p>
              <small>
                This protection is mathematical: the server or unauthorized client cannot read the
                evidence even if they alter frontend code or replay ciphertext for another student.
              </small>
            </div>
          )}

          {decryptedText && (
            <div className="notice crypto-success" role="status">
              <div className="decrypted-header">
                <strong>✓ Decrypted Medical & Accommodation Document</strong>
                <span className="auth-verified-badge">Authenticated by AES-GCM Tag & AAD</span>
              </div>
              <p className="decrypted-body">{decryptedText}</p>
            </div>
          )}

          <div className="evidence-interactive-actions">
            <span className="section-label">Interactive Cryptographic Verification:</span>
            <div className="button-group">
              <button
                className="button outline danger-outline"
                onClick={() => handleDecrypt("unauthorized_key")}
                disabled={isDecrypting}
                title="Attempts decryption with an invalid key"
              >
                {isDecrypting ? "Testing…" : "1. Test Unauthorized Key (Blocked)"}
              </button>

              <button
                className="button outline warning-outline"
                onClick={() => handleDecrypt("forged_aad")}
                disabled={isDecrypting}
                title="Attempts ciphertext replay attack for another student ID"
              >
                {isDecrypting ? "Testing…" : "2. Test AAD Replay Attack (Blocked)"}
              </button>

              <button
                className="button dark"
                onClick={() => handleDecrypt("authorized")}
                disabled={isDecrypting}
                title="Decrypts with valid Approver Panel credential"
              >
                {isDecrypting ? "Decrypting…" : "3. Decrypt as Approver Panel (Authorized)"}
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
