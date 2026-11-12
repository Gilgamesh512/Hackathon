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

  console.log("\nALL CRYPTOGRAPHIC TESTS PASSED (10/10)!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
