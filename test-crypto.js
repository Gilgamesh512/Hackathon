// Unit test for FairEnrol cryptographic integrity and encryption logic
import assert from "node:assert/strict";
import {
  sha256,
  computeAuditHash,
  verifyAuditChain,
  encryptConfidentialEvidence,
  decryptConfidentialEvidence,
  signApproverVote,
  verifyApproverVoteSignature,
  generateEphemeralApproverKeypair,
  resetApproverKeyToDefault,
  generateAnchorNotarizationReceipt,
  verifyAnchorNotarizationReceipt,
  splitSecretShamir,
  reconstructSecretShamir,
  encryptConfidentialEvidenceWithShamir,
  decryptConfidentialEvidenceWithShamir,
  signSarifDocument,
  verifySarifAttestation,
} from "./src/services/crypto.js";

async function runTests() {
  console.log("--- Starting FairEnrol Cryptographic Test Suite ---");

  // 1. SHA-256 test
  const hash = await sha256("test-payload");
  assert.ok(hash && hash.length === 64, "SHA-256 output must be a 64-char hex string");
  console.log("✓ SHA-256 hash generation verified:", hash.slice(0, 16) + "…");

  // 2. Hash chaining test
  const block1 = {
    id: "b1",
    time: "2026-10-22T08:00:00Z",
    actor: "Admin",
    action: "Genesis",
    reason: "Initial block",
  };
  const h1 = await computeAuditHash("", block1);
  block1.hash = h1;

  const block2 = {
    id: "b2",
    time: "2026-10-22T08:05:00Z",
    actor: "Registrar",
    action: "Set Quota",
    reason: "Limit 3 seats",
  };
  const h2 = await computeAuditHash(h1, block2);
  block2.hash = h2;

  // List ordered newest first
  const validChain = [block2, block1];
  const verificationValid = await verifyAuditChain(validChain);
  assert.equal(verificationValid.valid, true, "Chain must be cryptographically valid");
  console.log("✓ Valid audit chain verified (2 blocks):", verificationValid);

  // 3. Tampering detection test
  const tamperedBlock1 = { ...block1, reason: "Tampered reason by malicious attacker" };
  const tamperedChain = [block2, tamperedBlock1];
  const verificationTampered = await verifyAuditChain(tamperedChain);
  assert.equal(verificationTampered.valid, false, "Chain must detect tampering");
  console.log("✓ Tampering attack caught successfully:", verificationTampered.error);

  // 4. AES-GCM-256 Encryption & Decryption test
  const secretText = "Dr. Okafor Confidential Medical Note: Student S04 requires accessible lab.";
  const key = "TIDECLOAK_PANEL_SECRET_KEY_2026";
  const wrongKey = "INVALID_UNAUTHORIZED_KEY";

  const encrypted = await encryptConfidentialEvidence(secretText, key);
  assert.ok(encrypted.iv && encrypted.ciphertext, "Encrypted payload must contain IV and ciphertext");
  console.log("✓ AES-GCM-256 Encryption successful. Ciphertext length:", encrypted.ciphertext.length);

  // Decrypt with authorized key
  const decSuccess = await decryptConfidentialEvidence(encrypted, key);
  assert.equal(decSuccess.success, true, "Authorized decryption must succeed");
  assert.equal(decSuccess.plaintext, secretText, "Decrypted text must match original");
  console.log("✓ Authorized decryption succeeded:", decSuccess.plaintext);

  // Decrypt with unauthorized key
  const decFail = await decryptConfidentialEvidence(encrypted, wrongKey);
  assert.equal(decFail.success, false, "Unauthorized decryption must fail");
  console.log("✓ Unauthorized decryption was blocked by Web Crypto API:", decFail.error);

  // 5. Cryptographic Approver Vote Signing (HMAC-SHA-256)
  const approverId = "approver-1";
  const requestId = "req-test-99";
  const timestamp = "2026-11-03T10:00:00.000Z";
  const sigProof = await signApproverVote(approverId, requestId, "approve", timestamp, key);
  assert.ok(sigProof.signature && sigProof.signature.length === 64, "Signature must be 64-char hex HMAC");
  assert.equal(sigProof.algorithm, "HMAC-SHA-256");
  console.log("✓ Approver Vote signature generated successfully:", sigProof.signature.slice(0, 16) + "…");

  // 6. Signature Verification & Authenticity Check
  const voteEntry = {
    id: approverId,
    requestId,
    decision: "approve",
    votedAt: timestamp,
    signatureProof: sigProof,
  };
  const verifyResult = await verifyApproverVoteSignature(voteEntry, key);
  assert.equal(verifyResult.valid, true, "Valid signature must verify successfully");
  console.log("✓ Approver signature mathematical verification succeeded for", approverId);

  // 7. Forged Signature Detection (CWE-347)
  const forgedVoteEntry = {
    ...voteEntry,
    decision: "reject", // Malicious voter attempted to flip vote without resigning
  };
  const verifyForgedResult = await verifyApproverVoteSignature(forgedVoteEntry, key);
  assert.equal(verifyForgedResult.valid, false, "Tampered vote decision must fail verification");
  console.log("✓ Forged vote decision detected & blocked successfully (CWE-347):", verifyForgedResult.error);

  // 8. Modern Asymmetric NIST ECDSA P-256 Digital Signature (No Shared Secret)
  const ecdsaProof = await signApproverVote("approver-1", "req-ecdsa-01", "approve", timestamp);
  assert.ok(ecdsaProof.signature && ecdsaProof.signature.length === 128, "ECDSA P-256 signature must be 128-char hex (64-byte r||s)");
  assert.equal(ecdsaProof.algorithm, "ECDSA-P256-SHA256");
  assert.ok(ecdsaProof.publicKeyJwk, "ECDSA proof must contain public key JWK");
  console.log("✓ Asymmetric ECDSA P-256 digital signature created without shared secret:", ecdsaProof.signature.slice(0, 16) + "…");

  // 9. Zero-Secret Public Key Verification (Public Verifier)
  const ecdsaVoteEntry = {
    id: "approver-1",
    requestId: "req-ecdsa-01",
    decision: "approve",
    votedAt: timestamp,
    signatureProof: ecdsaProof,
  };
  // Anyone can verify using public key only (null / no secret key required)
  const ecdsaVerifyResult = await verifyApproverVoteSignature(ecdsaVoteEntry);
  assert.equal(ecdsaVerifyResult.valid, true, "ECDSA signature must verify successfully using public key alone");
  assert.equal(ecdsaVerifyResult.algorithm, "ECDSA-P256-SHA256");
  console.log("✓ Zero-secret public verification passed for Dr. Amara Okafor (Thumbprint:", ecdsaVerifyResult.publicKeyThumbprint + ")");

  // 10. Non-Repudiation & Cross-Approver Forgery Prevention (CWE-347)
  // Malicious attacker attempts to attribute Dr. Okafor's signature to Alex Morgan (approver-3)
  const spoofedVoteEntry = {
    ...ecdsaVoteEntry,
    id: "approver-3", // Attributing Dr. Okafor's signature to Student Rep
  };
  const spoofResult = await verifyApproverVoteSignature(spoofedVoteEntry);
  assert.equal(spoofResult.valid, false, "Signature must fail verification when attributed to another approver");
  console.log("✓ Cross-approver identity spoofing blocked successfully:", spoofResult.error);

  // 11. Dynamic Ephemeral ECDSA Keypair Generation (WebAuthn / Hardware Key Emulation)
  const ephemeralKey = await generateEphemeralApproverKeypair("approver-1");
  assert.ok(ephemeralKey.publicKeyJwk, "Ephemeral public key must be generated");
  assert.equal(ephemeralKey.isEphemeral, true);
  
  const ephSig = await signApproverVote("approver-1", "req-eph-01", "approve", timestamp);
  assert.equal(ephSig.isEphemeralKey, true, "Signature must mark ephemeral key source");

  const ephVoteEntry = {
    id: "approver-1",
    requestId: "req-eph-01",
    decision: "approve",
    votedAt: timestamp,
    signatureProof: ephSig,
  };
  const ephVerifyResult = await verifyApproverVoteSignature(ephVoteEntry);
  assert.equal(ephVerifyResult.valid, true, "Ephemeral key signature must verify with generated public key");
  assert.equal(ephVerifyResult.isEphemeralKey, true);
  console.log("✓ Dynamic ephemeral ECDSA keypair generated and verified in-memory (Thumbprint:", ephVerifyResult.publicKeyThumbprint + ")");

  // Reset to default fixture
  resetApproverKeyToDefault("approver-1");

  // 12. External Checkpoint Anchor Notarization Receipt & Merkle Proof
  const anchorReceipt = await generateAnchorNotarizationReceipt(h2, [block1, block2]);
  assert.ok(anchorReceipt.canonicalMerkleRoot, "Must generate canonical Merkle root");
  assert.equal(anchorReceipt.checkpointHash, h2);

  const receiptVerify = await verifyAnchorNotarizationReceipt(anchorReceipt, h2);
  assert.equal(receiptVerify.valid, true, "Valid receipt must verify against current ledger head");

  const tamperedReceiptVerify = await verifyAnchorNotarizationReceipt(anchorReceipt, "corrupted_head_hash_9999");
  assert.equal(tamperedReceiptVerify.valid, false, "Receipt must reject mismatching head hash");
  console.log("✓ External Checkpoint Anchor Notarization Receipt generated and mathematically verified against ledger head");

  // 13. Shamir's Secret Sharing (2-of-3 Threshold Cryptography)
  const sampleNote = "CONFIDENTIAL: Student S04 requires ground-floor disability accommodation.";
  const aad = { studentId: "s04", courseId: "comp3100" };
  const shamirEncrypted = await encryptConfidentialEvidenceWithShamir(sampleNote, aad);

  assert.equal(shamirEncrypted.shamirShares.length, 3, "Must generate exactly 3 Shamir shares");
  assert.equal(shamirEncrypted.algorithm, "AES-GCM-256-SSS-2OF3");

  const [share1, share2, share3] = shamirEncrypted.shamirShares;

  // 13.1 Threshold failure: 1 share alone cannot decrypt
  const singleShareDecrypt = await decryptConfidentialEvidenceWithShamir(shamirEncrypted, [share1], aad);
  assert.equal(singleShareDecrypt.success, false, "1 share must fail quorum threshold");
  console.log("✓ Shamir Threshold Invariant: 1 share alone rejected (Threshold Unmet)");

  // 13.2 Quorum Reconstruction: Pair (1, 2)
  const pair12Decrypt = await decryptConfidentialEvidenceWithShamir(shamirEncrypted, [share1, share2], aad);
  assert.equal(pair12Decrypt.success, true, "Pair (1,2) must reconstruct key and decrypt");
  assert.equal(pair12Decrypt.plaintext, sampleNote);
  console.log("✓ Shamir Quorum Reconstructed for Dr. Okafor + Sam Williams (Shares 1+2)");

  // 13.3 Quorum Reconstruction: Pair (2, 3)
  const pair23Decrypt = await decryptConfidentialEvidenceWithShamir(shamirEncrypted, [share2, share3], aad);
  assert.equal(pair23Decrypt.success, true, "Pair (2,3) must reconstruct key and decrypt");
  assert.equal(pair23Decrypt.plaintext, sampleNote);
  console.log("✓ Shamir Quorum Reconstructed for Sam Williams + Alex Morgan (Shares 2+3)");

  // 13.4 Quorum Reconstruction: Pair (1, 3)
  const pair13Decrypt = await decryptConfidentialEvidenceWithShamir(shamirEncrypted, [share1, share3], aad);
  assert.equal(pair13Decrypt.success, true, "Pair (1,3) must reconstruct key and decrypt");
  assert.equal(pair13Decrypt.plaintext, sampleNote);
  console.log("✓ Shamir Quorum Reconstructed for Dr. Okafor + Alex Morgan (Shares 1+3)");

  // 13.5 Tampered Share detected by AES-GCM Authentication Tag mismatch
  const corruptedShare2 = { ...share2, yHex: share2.yHex.slice(0, -4) + "ffff" };
  const corruptDecrypt = await decryptConfidentialEvidenceWithShamir(shamirEncrypted, [share1, corruptedShare2], aad);
  assert.equal(corruptDecrypt.success, false, "Tampered share must fail AES-GCM tag verification");
  console.log("✓ Tampered Shamir share caught by AES-GCM Authentication Tag mismatch");

  // 14. Verifiable Cryptographic SARIF Attestation (NIST ECDSA P-256)
  const mockSarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "FairEnrol Security Lab Engine", version: "1.0.0" } },
        results: [
          { ruleId: "BOLA-01", level: "error", message: { text: "IDOR on sensitive student records" } },
        ],
      },
    ],
  };

  const signedSarif = await signSarifDocument(mockSarif);
  assert.ok(signedSarif.attestation, "Signed SARIF must contain attestation header");
  assert.equal(signedSarif.attestation.algorithm, "ECDSA-P256-SHA256");

  const sarifVerify = await verifySarifAttestation(signedSarif);
  assert.equal(sarifVerify.valid, true, "Valid SARIF attestation must verify mathematically");
  console.log("✓ Cryptographic SARIF Attestation verified (Thumbprint:", sarifVerify.signerThumbprint + ")");

  // 14.1 Tamper Detection on SARIF report (e.g. attacker changes 'error' level to 'note')
  const tamperedSarif = JSON.parse(JSON.stringify(signedSarif));
  tamperedSarif.runs[0].results[0].level = "note"; // Malicious alteration
  const tamperedSarifVerify = await verifySarifAttestation(tamperedSarif);
  assert.equal(tamperedSarifVerify.valid, false, "Tampered SARIF report must be rejected (CWE-354)");
  console.log("✓ Malicious SARIF modification caught:", tamperedSarifVerify.error);

  console.log("\nALL CRYPTOGRAPHIC TESTS PASSED (14/14)!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
