// FairEnrol Cryptographic Service
// High-assurance implementation using standard W3C Web Crypto API.
// Features:
// - Deterministic Canonical JSON SHA-256 Hash Chaining
// - External Checkpoint Anchoring against whole-ledger rewrite attacks
// - AES-GCM-256 with Authenticated Additional Data (AAD) binding and unique nonce enforcement

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const subtleCrypto =
  typeof window !== "undefined" && window.crypto?.subtle
    ? window.crypto.subtle
    : globalThis.crypto?.subtle;

export const GENESIS_PREV_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

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
 * Deterministic JSON stringification to ensure canonical serialization
 * Keys are sorted recursively.
 */
export function canonicalJsonStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJsonStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify(obj[k]))
      .join(",") +
    "}"
  );
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
 * Computes canonical cryptographic hash for an audit log entry.
 * Hash incorporates: sequence number, previous hash, timestamp, actor, action, details, reason.
 */
export async function computeAuditHash(prevHash, entry) {
  const canonicalPayload = {
    seq: entry.seq ?? 1,
    prevHash: prevHash || GENESIS_PREV_HASH,
    time: entry.time,
    actor: entry.actor,
    action: entry.action,
    details: entry.details || {},
    reason: entry.reason || "",
  };

  const serialized = canonicalJsonStringify(canonicalPayload);
  return sha256(serialized);
}

/**
 * Verifies that the entire audit chain is structurally sound and mathematically untampered.
 * Supports chronological verification (oldest to newest).
 * Accepts optional external checkpoint hash to detect full-chain rewrite attacks.
 */
export async function verifyAuditChain(auditList, externalCheckpoint = null) {
  if (!auditList || auditList.length === 0) {
    return { valid: true, verifiedCount: 0, headHash: null };
  }

  // Audit list is stored newest first in UI; reverse for chronological verification
  const chronological = [...auditList].reverse();
  let prevHash = GENESIS_PREV_HASH;

  for (let i = 0; i < chronological.length; i++) {
    const block = chronological[i];
    const expectedSeq = i + 1;

    // Check sequence consistency if present
    if (block.seq !== undefined && block.seq !== expectedSeq) {
      return {
        valid: false,
        tamperedBlockIndex: auditList.length - 1 - i,
        tamperedBlockId: block.id,
        error: `Sequence numbering discrepancy at event #${i + 1}: expected ${expectedSeq}, found ${block.seq}`,
      };
    }

    // Verify linkage to previous block
    if (block.prevHash && block.prevHash !== prevHash) {
      return {
        valid: false,
        tamperedBlockIndex: auditList.length - 1 - i,
        tamperedBlockId: block.id,
        error: `Broken hash link at event #${i + 1} (${block.action}). Expected parent ${prevHash.slice(0, 8)}…, found ${block.prevHash.slice(0, 8)}…`,
      };
    }

    // Verify cryptographic content integrity
    const expectedHash = await computeAuditHash(prevHash, block);
    if (block.hash !== expectedHash) {
      return {
        valid: false,
        tamperedBlockIndex: auditList.length - 1 - i,
        tamperedBlockId: block.id,
        expectedHash,
        actualHash: block.hash,
        error: `Cryptographic tampering detected at event #${i + 1} (${block.action} by ${block.actor})`,
      };
    }

    prevHash = block.hash;
  }

  // External checkpoint validation (checks against whole-history recomputation attacks)
  if (externalCheckpoint && prevHash !== externalCheckpoint) {
    return {
      valid: false,
      tamperedBlockIndex: 0,
      tamperedBlockId: chronological[chronological.length - 1]?.id,
      error: `External Checkpoint Mismatch: Current chain head does not match signed anchor checkpoint (${externalCheckpoint.slice(0, 10)}…)`,
    };
  }

  return {
    valid: true,
    verifiedCount: chronological.length,
    headHash: prevHash,
    checkpointMatches: externalCheckpoint ? prevHash === externalCheckpoint : null,
  };
}

/**
 * Derives an AES-GCM 256-bit CryptoKey using PBKDF2 with standard salt and iteration count
 */
async function deriveAesKey(passcode) {
  const keyMaterial = await subtleCrypto.importKey(
    "raw",
    textEncoder.encode(passcode),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const salt = textEncoder.encode("FairEnrol_E2EE_Salt_2026_TideCloak");

  return subtleCrypto.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts sensitive exception evidence (e.g. medical certificates or accommodation notes)
 * using authenticated AES-GCM-256 with Authenticated Additional Data (AAD).
 * AAD binds the ciphertext to the beneficiary student ID and proposal context.
 */
export async function encryptConfidentialEvidence(
  plaintext,
  secretPasscode,
  aadMetadata = null
) {
  const key = await deriveAesKey(secretPasscode);
  const iv = getRandomValues(new Uint8Array(12)); // Unique 96-bit nonce
  const encodedPlaintext = textEncoder.encode(plaintext);

  const encryptParams = {
    name: "AES-GCM",
    iv,
  };

  let aadString = null;
  if (aadMetadata) {
    aadString = typeof aadMetadata === "string" ? aadMetadata : canonicalJsonStringify(aadMetadata);
    encryptParams.additionalData = textEncoder.encode(aadString);
  }

  const ciphertextBuffer = await subtleCrypto.encrypt(
    encryptParams,
    key,
    encodedPlaintext
  );

  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
    algorithm: "AES-GCM-256",
    aad: aadString,
    encryptedAt: new Date().toISOString(),
  };
}

/**
 * Decrypts sensitive exception evidence.
 * If the passcode is incorrect OR if the Authenticated Additional Data does not match,
 * Web Crypto API will reject with OperationError (authentication tag mismatch).
 */
export async function decryptConfidentialEvidence(
  encryptedPayload,
  secretPasscode,
  aadMetadata = null
) {
  try {
    const key = await deriveAesKey(secretPasscode);
    const iv = base64ToBuffer(encryptedPayload.iv);
    const ciphertext = base64ToBuffer(encryptedPayload.ciphertext);

    const decryptParams = {
      name: "AES-GCM",
      iv: new Uint8Array(iv),
    };

    // Use payload's stored AAD or provided verification AAD
    const aadToVerify = aadMetadata !== null ? aadMetadata : encryptedPayload.aad;
    if (aadToVerify) {
      const aadString = typeof aadToVerify === "string" ? aadToVerify : canonicalJsonStringify(aadToVerify);
      decryptParams.additionalData = textEncoder.encode(aadString);
    }

    const decryptedBuffer = await subtleCrypto.decrypt(
      decryptParams,
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
      error:
        "Cryptographic Decryption Failed: Invalid authorization key or authentication tag mismatch. Access Denied by AES-GCM-256.",
    };
  }
}
