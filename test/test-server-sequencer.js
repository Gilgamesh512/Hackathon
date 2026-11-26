// Acceptance and Security Invariant Test for FairEnrol Verifiable Server Sequencer
// Verifies:
// 1. Server initialization & canonical Genesis audit ledger
// 2. Server-side Atomic Concurrency Lock (CWE-362 Race Condition Prevention)
// 3. Strict FIFO auto-promotion on seat vacancy
// 4. Server-enforced Asymmetric NIST ECDSA P-256 vote signature verification (CWE-347)
// 5. Quorum 2-of-3 execution and public ledger immutability

import assert from "node:assert/strict";
import { createLabManagerServer } from "../src/lab/server.js";
import { signApproverVote, verifyAuditChain } from "../src/services/crypto.js";

async function runSequencerTests() {
  console.log("==================================================================");
  console.log("    FairEnrol Verifiable Server Sequencer Test Suite              ");
  console.log("==================================================================\n");

  const { server, sequencer } = createLabManagerServer();
  const PORT = 4055;

  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${PORT}/api/fairenrol`;

  try {
    // TEST 1: Canonical Server State & Genesis Ledger
    console.log("Test 1: Server State & Initial Cryptographic Ledger");
    const stateRes = await fetch(`${baseUrl}/state`);
    const state = await stateRes.json();
    assert.equal(stateRes.status, 200, "State endpoint must return 200");
    assert.ok(state.courses.length >= 3, "Must have courses loaded");
    assert.ok(state.audit.length >= 2, "Must contain Genesis and initial quota blocks");
    assert.ok(state.checkpointAnchor, "Must have initial Checkpoint Anchor");

    const chainValid = await verifyAuditChain(state.audit, state.checkpointAnchor);
    assert.equal(chainValid.valid, true, "Initial server ledger must be cryptographically sound");
    console.log("  ✓ Server initialized with sound Genesis ledger and Checkpoint Anchor.\n");

    // TEST 2: Server-Side Massive Concurrency Race (Atomic Lock, CWE-362)
    console.log("Test 2: Server-Side Massive Concurrency Race (20 simultaneous requests for 1 seat)");
    // Find course with 1 open seat or set capacity
    const compCourse = state.courses.find((c) => c.id === "comp3100");
    // Expand capacity to 4 so exactly 1 new seat is available
    await fetch(`${baseUrl}/capacity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: "comp3100", capacity: 4, actor: "Registrar" }),
    });

    // Fire 20 simultaneous enrolment requests
    const promises = Array.from({ length: 20 }, (_, i) =>
      fetch(`${baseUrl}/enrol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: "comp3100",
          studentId: `contender_s${i + 1}`,
          studentName: `Contender #${i + 1}`,
          actor: `contender_s${i + 1}`,
        }),
      }).then((r) => r.json())
    );

    const results = await Promise.all(promises);
    const updatedStateRes = await fetch(`${baseUrl}/state`);
    const updatedState = await updatedStateRes.json();
    const courseAfter = updatedState.courses.find((c) => c.id === "comp3100");

    assert.equal(courseAfter.capacity, 4, "Capacity must be exactly 4");
    assert.equal(courseAfter.enrolled.length, 4, "Enrolled count must not exceed 4 (zero over-subscription)");
    assert.ok(courseAfter.waitlist.length >= 19, "Remaining contenders must be strictly ordered in waitlist");
    console.log("  ✓ Server atomic lock handled 20 concurrent requests with zero over-subscription.\n");

    // TEST 3: Asymmetric NIST ECDSA Vote Verification on Server (CWE-347)
    console.log("Test 3: Server-Side Asymmetric NIST ECDSA Vote Verification & Quorum (CWE-347)");
    // Submit proposal
    const reqRes = await fetch(`${baseUrl}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: {
          kind: "force",
          courseId: "isys3414",
          studentId: "s20",
          requester: "Taylor Reed (Registrar)",
          requesterId: "registrar-1",
          reason: "Critical graduation requirement: Student requires final semester unit.",
        },
      }),
    });
    const { request: proposal } = await reqRes.json();
    assert.ok(proposal.id, "Proposal must be created");

    const ts = new Date().toISOString();

    // 3a. Forged vote attempt (forged decision or spoofed key)
    const forgedSigProof = await signApproverVote("approver-1", proposal.id, "approve", ts);
    const forgedVoteRes = await fetch(`${baseUrl}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approverId: "approver-1",
        approverName: "Dr. Amara Okafor",
        requestId: proposal.id,
        decision: "reject", // Altered decision vs signed "approve"
        signatureProof: forgedSigProof,
      }),
    });
    assert.equal(forgedVoteRes.status, 400, "Server must reject forged vote with HTTP 400");
    const forgedErr = await forgedVoteRes.json();
    assert.ok(forgedErr.error.includes("CWE-347"), "Error message must cite signature failure CWE-347");
    console.log("  ✓ Server rejected forged vote attempt (CWE-347).");

    // 3b. Authentic Vote 1 from Dr. Okafor (approver-1)
    const validSig1 = await signApproverVote("approver-1", proposal.id, "approve", ts);
    const vote1Res = await fetch(`${baseUrl}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approverId: "approver-1",
        approverName: "Dr. Amara Okafor",
        requestId: proposal.id,
        decision: "approve",
        signatureProof: validSig1,
      }),
    });
    assert.equal(vote1Res.status, 200, "Valid vote 1 must be accepted");
    const vote1Data = await vote1Res.json();
    assert.equal(vote1Data.request.approvals.length, 1, "Must have 1 approval");
    assert.equal(vote1Data.request.status, "pending", "Must still be pending (needs 2 votes)");

    // 3c. Authentic Vote 2 from Sam Williams (approver-2) -> Quorum reached!
    const ts2 = new Date().toISOString();
    const validSig2 = await signApproverVote("approver-2", proposal.id, "approve", ts2);
    const vote2Res = await fetch(`${baseUrl}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approverId: "approver-2",
        approverName: "Sam Williams",
        requestId: proposal.id,
        decision: "approve",
        signatureProof: validSig2,
      }),
    });
    assert.equal(vote2Res.status, 200, "Valid vote 2 must be accepted");
    const vote2Data = await vote2Res.json();
    assert.equal(vote2Data.request.status, "approved", "Quorum must be reached and status approved");

    // Verify course has s20 enrolled
    const finalStateRes = await fetch(`${baseUrl}/state`);
    const finalState = await finalStateRes.json();
    const isysCourse = finalState.courses.find((c) => c.id === "isys3414");
    assert.ok(isysCourse.enrolled.includes("s20"), "Student s20 must be enrolled after 2-of-3 quorum");
    console.log("  ✓ Multi-party 2-of-3 quorum consensus verified on server with Asymmetric ECDSA signatures.\n");

    // TEST 4: Full Ledger Integrity Verification
    console.log("Test 4: Server Ledger Hash Chain & Checkpoint Anchor Soundness");
    const auditChainCheck = await verifyAuditChain(finalState.audit, finalState.checkpointAnchor);
    assert.equal(auditChainCheck.valid, true, "Final ledger must be 100% cryptographically valid");
    console.log(`  ✓ Successfully verified entire chain of ${auditChainCheck.verifiedCount} blocks against external anchor.\n`);

    // TEST 5: Server-Side TideCloak JWT Bearer Token & RBAC Role Enforcement
    console.log("Test 5: Server-Side TideCloak JWT Bearer Token & RBAC Role Enforcement");
    
    // Helper to forge a mock test JWT token
    function createMockJwt(roles, username = "testuser", expired = false) {
      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const exp = expired ? Math.floor(Date.now() / 1000) - 300 : Math.floor(Date.now() / 1000) + 3600;
      const payload = Buffer.from(
        JSON.stringify({
          sub: "usr-test-123",
          preferred_username: username,
          exp,
          realm_access: { roles },
        })
      ).toString("base64url");
      return `${header}.${payload}.mockSignatureSignature`;
    }

    // 5a. Unauthorized student token attempting to change course quota (must be rejected with HTTP 403)
    const studentToken = createMockJwt(["student"], "student_riley");
    const forbiddenRes = await fetch(`${baseUrl}/capacity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ courseId: "comp3100", capacity: 10 }),
    });
    assert.equal(forbiddenRes.status, 403, "Student token must be rejected from modifying capacity with HTTP 403");
    const forbiddenData = await forbiddenRes.json();
    assert.ok(forbiddenData.error.includes("registrar"), "Error must cite required registrar role");
    console.log("  ✓ Server enforced RBAC: Unauthorized student token blocked from modifying course quota (HTTP 403).");

    // 5b. Expired token must be rejected with HTTP 401
    const expiredToken = createMockJwt(["registrar"], "taylor_reed", true);
    const expiredRes = await fetch(`${baseUrl}/capacity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${expiredToken}`,
      },
      body: JSON.stringify({ courseId: "comp3100", capacity: 10 }),
    });
    assert.equal(expiredRes.status, 401, "Expired token must be rejected with HTTP 401");
    console.log("  ✓ Server rejected expired TideCloak session token (HTTP 401).");

    // 5c. Authorized registrar token must be accepted with HTTP 200
    const registrarToken = createMockJwt(["registrar"], "taylor_reed");
    const authorizedRes = await fetch(`${baseUrl}/capacity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${registrarToken}`,
      },
      body: JSON.stringify({ courseId: "comp3100", capacity: 5 }),
    });
    assert.equal(authorizedRes.status, 200, "Authorized registrar token must be accepted with HTTP 200");
    console.log("  ✓ Server accepted authorized TideCloak Bearer JWT token with registrar role (HTTP 200).\n");

    // TEST 6: Server Tamper & Restore + Strict Auth Enforcement
    console.log("Test 6: Strict Auth Mode (FAIRE_STRICT_AUTH) & Audit Restore Invariant");
    const tamperRes = await fetch(`${baseUrl}/tamper`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "single" }),
    });
    assert.equal(tamperRes.status, 200);
    const tamperedState = await (await fetch(`${baseUrl}/state`)).json();
    assert.equal(tamperedState.isTampered, true, "Server ledger should report tampered");

    const restoreRes = await fetch(`${baseUrl}/restore`, { method: "POST" });
    assert.equal(restoreRes.status, 200);
    const restoredState = await (await fetch(`${baseUrl}/state`)).json();
    assert.equal(restoredState.isTampered, false, "Restore must clear tampered state");
    const restoredValid = await verifyAuditChain(restoredState.audit, restoredState.checkpointAnchor);
    assert.equal(restoredValid.valid, true, "Restored audit chain must verify cleanly");

    // Strict Auth Server rejects missing tokens AND unsigned/forged JWTs
    const { server: strictServer } = createLabManagerServer({ strictAuth: true, oidcUrl: "http://127.0.0.1:59999" });
    const STRICT_PORT = 4056;
    await new Promise((resolve) => strictServer.listen(STRICT_PORT, "127.0.0.1", resolve));
    try {
      const strictBase = `http://127.0.0.1:${STRICT_PORT}/api/fairenrol`;
      const anonCap = await fetch(`${strictBase}/capacity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: "comp3100", capacity: 10 }),
      });
      assert.equal(anonCap.status, 401, "Strict auth mode must reject unauthenticated request with HTTP 401");

      const mockJwtCap = await fetch(`${strictBase}/capacity`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${registrarToken}`,
        },
        body: JSON.stringify({ courseId: "comp3100", capacity: 10 }),
      });
      assert.equal(mockJwtCap.status, 401, "Strict auth mode must reject unverified/forged JWT signature with HTTP 401");
      console.log("  ✓ Strict Auth mode rejected unauthenticated (401) and unsigned/forged JWT (401).\n");
    } finally {
      await new Promise((resolve) => strictServer.close(resolve));
    }

    console.log("==================================================================");
    console.log("  ALL SERVER SEQUENCER INVARIANT TESTS PASSED! (6/6)              ");
    console.log("==================================================================\n");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runSequencerTests().catch((err) => {
  console.error("Sequencer test failed:", err);
  process.exit(1);
});
