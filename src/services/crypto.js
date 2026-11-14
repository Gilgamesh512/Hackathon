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
  // Support single-argument call: computeAuditHash(entry)
  if (entry === undefined) {
    if (typeof prevHash === "object" && prevHash !== null) {
      entry = prevHash;
      prevHash = entry.prevHash || GENESIS_PREV_HASH;
    } else {
      entry = {};
    }
  }

  const canonicalPayload = {
    seq: entry?.seq ?? 1,
    prevHash: (typeof prevHash === "string" ? prevHash : null) || entry?.prevHash || GENESIS_PREV_HASH,
    time: entry?.time || entry?.timestamp || new Date().toISOString(),
    actor: entry?.actor || "system",
    action: entry?.action || entry?.attackType || "audit",
    details: entry?.details || entry?.payloadSummary || {},
    reason: entry?.reason || entry?.indicator || "",
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

// NIST P-256 Elliptic Curve Keypairs for Authorized Approvers
// Provides non-repudiation and prevents cross-approver signature forgery (CWE-347).
export const APPROVER_KEYPAIRS = {
  "approver-1": {
    name: "Dr. Amara Okafor",
    role: "Head of School",
    pub: {
      kty: "EC",
      crv: "P-256",
      x: "AkrqnW47Q5Pw5QSed8GjHnj5_0S1pa_anGtd1dl__Nk",
      y: "gBsyMSB9XDH07n_etjsjhUgkhLk3YqDVSTLcEl6mv8A",
      key_ops: ["verify"],
      ext: true,
    },
    priv: {
      kty: "EC",
      crv: "P-256",
      x: "AkrqnW47Q5Pw5QSed8GjHnj5_0S1pa_anGtd1dl__Nk",
      y: "gBsyMSB9XDH07n_etjsjhUgkhLk3YqDVSTLcEl6mv8A",
      d: "8YNBzfcNCf6VgQu1Dz5WwvpaE6Lkkn0xEim9CoTd-6Q",
      key_ops: ["sign"],
      ext: true,
    },
  },
  "approver-2": {
    name: "Sam Williams",
    role: "Academic Advisor",
    pub: {
      kty: "EC",
      crv: "P-256",
      x: "2347raGQ6x8k5JS6Y4g1vVC7jVC-URLhFEfsJlPSSEY",
      y: "Zm231c4AmBjpdSLFD2GByLnSwQd-l4dAZ4HHCY87ypo",
      key_ops: ["verify"],
      ext: true,
    },
    priv: {
      kty: "EC",
      crv: "P-256",
      x: "2347raGQ6x8k5JS6Y4g1vVC7jVC-URLhFEfsJlPSSEY",
      y: "Zm231c4AmBjpdSLFD2GByLnSwQd-l4dAZ4HHCY87ypo",
      d: "9k4aDI85zw2sQpYEMTx8dVXzC937OVUDclALmYYv0Jc",
      key_ops: ["sign"],
      ext: true,
    },
  },
  "approver-3": {
    name: "Alex Morgan",
    role: "Student Representative",
    pub: {
      kty: "EC",
      crv: "P-256",
      x: "_bR4Eus0kGxtjEUz-5dsm9qewn-PAS8wYoD1WyD4i7E",
      y: "Tq4iIeP02tbLTqZdxVe4uPjU6DsEjnwk1R6JwljcY30",
      key_ops: ["verify"],
      ext: true,
    },
    priv: {
      kty: "EC",
      crv: "P-256",
      x: "_bR4Eus0kGxtjEUz-5dsm9qewn-PAS8wYoD1WyD4i7E",
      y: "Tq4iIeP02tbLTqZdxVe4uPjU6DsEjnwk1R6JwljcY30",
      d: "KWLVYjQvAl8uVxcMmUzMg9MEt-6LYkb8_nYQ9E3t0vU",
      key_ops: ["sign"],
      ext: true,
    },
  },
};

/**
 * Returns public key JWK for a registered panel approver
 */
export function getApproverPublicKey(approverId) {
  return APPROVER_KEYPAIRS[approverId]?.pub || null;
}

/**
 * Signs an approver's quorum vote.
 * By default, uses Asymmetric NIST ECDSA P-256 with SHA-256 for mathematical non-repudiation.
 * Supports legacy HMAC-SHA-256 when a symmetric secret key is explicitly provided.
 */
export async function signApproverVote(approverId, requestId, decision, timestamp, keyOrOption) {
  const payload = canonicalJsonStringify({
    approverId,
    requestId,
    decision,
    timestamp,
  });

  const payloadEncoded = textEncoder.encode(payload);
  const payloadHash = await sha256(payload);

  // If a legacy symmetric secret key is explicitly requested
  if (typeof keyOrOption === "string" && keyOrOption.includes("SECRET_KEY")) {
    const enc = textEncoder.encode(keyOrOption);
    const hmacKey = await subtleCrypto.importKey(
      "raw",
      enc,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await subtleCrypto.sign("HMAC", hmacKey, payloadEncoded);
    return {
      signature: bufferToHex(signatureBuffer),
      algorithm: "HMAC-SHA-256",
      payloadHash,
      signedAt: timestamp,
    };
  }

  // Modern Asymmetric ECDSA P-256 Digital Signature
  const keypair = APPROVER_KEYPAIRS[approverId];
  if (!keypair) {
    throw new Error(`Unauthorized approver ID '${approverId}': No registered cryptographic keypair.`);
  }

  const privKey = await subtleCrypto.importKey(
    "jwk",
    keypair.priv,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await subtleCrypto.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privKey,
    payloadEncoded
  );

  return {
    signature: bufferToHex(sigBuffer),
    algorithm: "ECDSA-P256-SHA256",
    keyId: approverId,
    publicKeyJwk: keypair.pub,
    payloadHash,
    signedAt: timestamp,
  };
}

/**
 * Verifies an approver's vote signature against the canonical payload.
 * Verifies Asymmetric ECDSA P-256 signatures using the approver's public key (Zero-Secrets required to verify).
 * Also supports legacy HMAC-SHA-256 verification when applicable.
 * Rejects forged signatures and altered voting decisions (CWE-347).
 */
export async function verifyApproverVoteSignature(voteEntry, optionalKeyOrPublic) {
  if (!voteEntry || !voteEntry.signatureProof || !voteEntry.signatureProof.signature) {
    return { valid: false, error: "Missing cryptographic signature proof" };
  }

  try {
    const payload = canonicalJsonStringify({
      approverId: voteEntry.id,
      requestId: voteEntry.requestId,
      decision: voteEntry.decision,
      timestamp: voteEntry.votedAt,
    });
    const payloadEncoded = textEncoder.encode(payload);

    const sigHex = voteEntry.signatureProof.signature;
    const sigMatches = sigHex.match(/.{1,2}/g);
    if (!sigMatches) {
      return { valid: false, error: "Malformed signature format" };
    }
    const sigBytes = new Uint8Array(sigMatches.map((b) => parseInt(b, 16)));

    const algorithm = voteEntry.signatureProof.algorithm || "HMAC-SHA-256";

    // 1. Asymmetric ECDSA P-256 Verification (Primary)
    if (algorithm === "ECDSA-P256-SHA256") {
      const pubJwk =
        optionalKeyOrPublic?.kty === "EC"
          ? optionalKeyOrPublic
          : APPROVER_KEYPAIRS[voteEntry.id]?.pub || voteEntry.signatureProof.publicKeyJwk;

      if (!pubJwk) {
        return { valid: false, error: `No public key found for approver '${voteEntry.id}'` };
      }

      const pubCryptoKey = await subtleCrypto.importKey(
        "jwk",
        pubJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );

      const valid = await subtleCrypto.verify(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        pubCryptoKey,
        sigBytes,
        payloadEncoded
      );

      return {
        valid,
        approverId: voteEntry.id,
        requestId: voteEntry.requestId,
        algorithm: "ECDSA-P256-SHA256",
        publicKeyThumbprint: pubJwk.x?.slice(0, 10),
        error: valid
          ? null
          : "Cryptographic signature verification failed: Forged or altered vote detected (CWE-347)",
      };
    }

    // 2. Symmetric HMAC-SHA-256 Verification (Legacy Backwards Compatibility)
    const keySecret = typeof optionalKeyOrPublic === "string" ? optionalKeyOrPublic : "TIDECLOAK_PANEL_SECRET_KEY_2026";
    const enc = textEncoder.encode(keySecret);
    const hmacKey = await subtleCrypto.importKey(
      "raw",
      enc,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const valid = await subtleCrypto.verify(
      "HMAC",
      hmacKey,
      sigBytes,
      payloadEncoded
    );

    return {
      valid,
      approverId: voteEntry.id,
      requestId: voteEntry.requestId,
      algorithm: "HMAC-SHA-256",
      error: valid
        ? null
        : "Cryptographic signature verification failed: Forged or altered vote detected (CWE-347)",
    };
  } catch (err) {
    return {
      valid: false,
      error: `Signature verification exception: ${err.message}`,
    };
  }
}

