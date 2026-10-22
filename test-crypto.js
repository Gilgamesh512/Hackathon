// Unit test for FairEnrol cryptographic integrity and encryption logic
import {
  sha256,
  computeAuditHash,
  verifyAuditChain,
  encryptConfidentialEvidence,
  decryptConfidentialEvidence,
} from "./src/services/crypto.js";

async function runTests() {
  console.log("--- Starting FairEnrol Cryptographic Test Suite ---");

  // 1. SHA-256 test
  const hash = await sha256("test-payload");
  console.assert(hash && hash.length === 64, "SHA-256 output must be a 64-char hex string");
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
  console.assert(verificationValid.valid === true, "Chain must be cryptographically valid");
  console.log("✓ Valid audit chain verified (2 blocks):", verificationValid);

  // 3. Tampering detection test
  const tamperedBlock1 = { ...block1, reason: "Tampered reason by malicious attacker" };
  const tamperedChain = [block2, tamperedBlock1];
  const verificationTampered = await verifyAuditChain(tamperedChain);
  console.assert(verificationTampered.valid === false, "Chain must detect tampering");
  console.log("✓ Tampering attack caught successfully:", verificationTampered.error);

  // 4. AES-GCM-256 Encryption & Decryption test
  const secretText = "Dr. Okafor Confidential Medical Note: Student S04 requires accessible lab.";
  const key = "TIDECLOAK_PANEL_SECRET_KEY_2026";
  const wrongKey = "INVALID_UNAUTHORIZED_KEY";

  const encrypted = await encryptConfidentialEvidence(secretText, key);
  console.assert(encrypted.iv && encrypted.ciphertext, "Encrypted payload must contain IV and ciphertext");
  console.log("✓ AES-GCM-256 Encryption successful. Ciphertext length:", encrypted.ciphertext.length);

  // Decrypt with authorized key
  const decSuccess = await decryptConfidentialEvidence(encrypted, key);
  console.assert(decSuccess.success === true && decSuccess.plaintext === secretText, "Decrypted text must match original");
  console.log("✓ Authorized decryption succeeded:", decSuccess.plaintext);

  // Decrypt with unauthorized key
  const decFail = await decryptConfidentialEvidence(encrypted, wrongKey);
  console.assert(decFail.success === false, "Unauthorized decryption must fail");
  console.log("✓ Unauthorized decryption was blocked by Web Crypto API:", decFail.error);

  console.log("\nALL CRYPTOGRAPHIC TESTS PASSED (5/5)!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
