// FairEnrol Cryptographic Service
// Uses standard W3C Web Crypto API for zero-dependency cryptographic guarantees across Browser and Node environments.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const subtleCrypto =
  typeof window !== "undefined" && window.crypto?.subtle
    ? window.crypto.subtle
    : globalThis.crypto?.subtle;

function getRandomValues(array) {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    return window.crypto.getRandomValues(array);
  }
  return globalThis.crypto.getRandomValues(array);
}

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function base64ToBuffer(base64) {
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  const buf = Buffer.from(base64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Computes SHA-256 hex digest of a string
 */
export async function sha256(message) {
  const data = textEncoder.encode(message);
  const hashBuffer = await subtleCrypto.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

/**
 * Computes a cryptographic hash for an audit log entry chained to the previous entry
 */
export async function computeAuditHash(prevHash, entry) {
  const payload = [
    prevHash || "GENESIS_BLOCK_00000000000000000000000000000000000000000000000000000000",
    entry.id,
    entry.time,
    entry.actor,
    entry.action,
    entry.reason || "",
  ].join("|");

  return sha256(payload);
}

/**
 * Verifies that the entire audit log has not been altered or tampered with
 * auditList is ordered newest first in state; we reverse to verify chronologically
 */
export async function verifyAuditChain(auditList) {
  if (!auditList || auditList.length === 0) {
    return { valid: true, verifiedCount: 0 };
  }

  // Chronological order: oldest to newest
  const chronological = [...auditList].reverse();
  let prevHash = "GENESIS_BLOCK_00000000000000000000000000000000000000000000000000000000";

  for (let i = 0; i < chronological.length; i++) {
    const block = chronological[i];
    const expectedHash = await computeAuditHash(prevHash, block);

    if (block.hash !== expectedHash) {
      return {
        valid: false,
        tamperedBlockIndex: auditList.length - 1 - i,
        tamperedBlockId: block.id,
        expectedHash,
        actualHash: block.hash,
        error: `Tampering detected at event #${i + 1} (${block.action} by ${block.actor})`,
      };
    }
    prevHash = block.hash;
  }

  return { valid: true, verifiedCount: chronological.length };
}

/**
 * Derives an AES-GCM 256-bit CryptoKey from a secret passphrase/role credential
 */
async function deriveAesKey(passcode) {
  const rawKey = textEncoder.encode(passcode.padEnd(32, "0").slice(0, 32));
  return subtleCrypto.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts sensitive exception evidence (e.g. medical certificates or accommodation notes)
 * using authenticated AES-GCM-256.
 */
export async function encryptConfidentialEvidence(plaintext, secretPasscode) {
  const key = await deriveAesKey(secretPasscode);
  const iv = getRandomValues(new Uint8Array(12));
  const encodedPlaintext = textEncoder.encode(plaintext);

  const ciphertextBuffer = await subtleCrypto.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encodedPlaintext
  );

  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
    algorithm: "AES-GCM-256",
    encryptedAt: new Date().toISOString(),
  };
}

/**
 * Decrypts sensitive exception evidence.
 * If the passcode is incorrect, Web Crypto API will reject with OperationError (integrity tag mismatch).
 */
export async function decryptConfidentialEvidence(encryptedPayload, secretPasscode) {
  try {
    const key = await deriveAesKey(secretPasscode);
    const iv = base64ToBuffer(encryptedPayload.iv);
    const ciphertext = base64ToBuffer(encryptedPayload.ciphertext);

    const decryptedBuffer = await subtleCrypto.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(iv),
      },
      key,
      ciphertext
    );

    return {
      success: true,
      plaintext: textDecoder.decode(decryptedBuffer),
    };
  } catch (error) {
    return {
      success: false,
      error: "Cryptographic Decryption Failed: Invalid authorization key or authentication tag mismatch. You do not hold the required Approver Panel decryption key.",
    };
  }
}
