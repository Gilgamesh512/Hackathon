// FairEnrol Verifiable Server-Side FIFO Sequencer & Central State Machine
// Provides:
// 1. Atomic microsecond concurrency lock (eliminates CWE-362 Race Conditions)
// 2. Server-enforced strict FIFO waitlist promotion
// 3. Cryptographic Verification of Asymmetric NIST ECDSA P-256 vote signatures (CWE-347)
// 4. SHA-256 hash-chained public audit ledger & Checkpoint Anchor updates
// 5. Server-Sent Events (SSE) broadcasting for multi-computer cross-network synchronization

import fs from "node:fs";
import path from "node:path";
import {
  canonicalJsonStringify,
  computeAuditHash,
  verifyAuditChain,
  verifyApproverVoteSignature,
  APPROVER_KEYPAIRS,
  GENESIS_PREV_HASH,
} from "../services/crypto.js";

const SEED_PATH = path.resolve(process.cwd(), "src/seed.json");

function loadSeedData() {
  try {
    const raw = fs.readFileSync(SEED_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load seed.json:", err);
    return { students: [], courses: [] };
  }
}

const GENESIS_BLOCK_1 = {
  seq: 1,
  id: "init-01",
  prevHash: GENESIS_PREV_HASH,
  time: "2026-10-22T08:00:00.000Z",
  actor: "FairEnrol System",
  action: "FIFO Registration System Initialized",
  details: { consensusQuorum: "2-of-3", encryption: "AES-GCM-256", hashing: "SHA-256" },
  reason: "Genesis enrollment block created. Strict FIFO waitlist algorithm deployed with 2-of-3 approver consensus requirement.",
  hash: "a45aa44c58d1a701747ba429b2943210cd3b584378ac41cf129515537001942a",
};

const GENESIS_BLOCK_2 = {
  seq: 2,
  id: "init-02",
  prevHash: "a45aa44c58d1a701747ba429b2943210cd3b584378ac41cf129515537001942a",
  time: "2026-10-22T08:30:00.000Z",
  actor: "Taylor Reed (Registrar)",
  action: "Course Quotas Published",
  details: { comp3100: 3, isys3414: 4, cosc2408: 3 },
  reason: "Course capacities set for COMP3100 (3 seats), ISYS3414 (4 seats), COSC2408 (3 seats).",
  hash: "05f7a7b03bf6b02b750d14dc4ebfcaa6a3b66aae2c4a49a6d433a0245984895b",
};

export class FairEnrolSequencer {
  constructor() {
    this._queue = Promise.resolve();
    this.sseClients = new Set();
    this.resetState();
  }

  /**
   * Serializes all state mutations sequentially (Atomic Lock / Concurrency Serializer)
   */
  async _atomicDispatch(operation) {
    const run = this._queue.then(() => operation());
    this._queue = run.catch(() => {});
    return run;
  }

  resetState() {
    const seed = loadSeedData();
    this.courses = JSON.parse(JSON.stringify(seed.courses));
    this.students = JSON.parse(JSON.stringify(seed.students));
    this.panel = [
      {
        id: "approver-1",
        name: "Dr. Amara Okafor",
        title: "Head of School",
        publicKey: APPROVER_KEYPAIRS["approver-1"]?.pub,
      },
      {
        id: "approver-2",
        name: "Sam Williams",
        title: "Academic Advisor",
        publicKey: APPROVER_KEYPAIRS["approver-2"]?.pub,
      },
      {
        id: "approver-3",
        name: "Alex Morgan",
        title: "Student Representative",
        publicKey: APPROVER_KEYPAIRS["approver-3"]?.pub,
      },
    ];
    this.requests = [];
    this.audit = [
      JSON.parse(JSON.stringify(GENESIS_BLOCK_2)),
      JSON.parse(JSON.stringify(GENESIS_BLOCK_1)),
    ];
    this.checkpointAnchor = this.audit[0]?.hash || null;
    this.cleanBackup = JSON.parse(JSON.stringify(this.audit));
    this.isTampered = false;
    this.broadcastUpdate("STATE_RESET");
  }

  getState() {
    return {
      courses: this.courses,
      students: this.students,
      panel: this.panel,
      requests: this.requests,
      audit: this.audit,
      checkpointAnchor: this.checkpointAnchor,
      isTampered: this.isTampered,
      sequencerStatus: {
        active: true,
        mode: "VERIFIABLE_ATOMIC_SEQUENCER",
        port: 4000,
        connectedClients: this.sseClients.size,
      },
    };
  }

  /**
   * Appends an audit event to the SHA-256 hash chain and updates the Checkpoint Anchor
   */
  async _appendAuditBlock(actor, action, details, reason) {
    const prevBlock = this.audit[0];
    const prevHash = prevBlock ? prevBlock.hash : GENESIS_PREV_HASH;
    const nextSeq = prevBlock ? (prevBlock.seq || 0) + 1 : 1;

    const block = {
      seq: nextSeq,
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      prevHash,
      time: new Date().toISOString(),
      actor,
      action,
      details: details || {},
      reason: reason || "",
    };

    block.hash = await computeAuditHash(prevHash, block);
    this.audit.unshift(block);
    this.checkpointAnchor = block.hash;
    this.cleanBackup = JSON.parse(JSON.stringify(this.audit));
    return block;
  }

  /**
   * Atomic Course Enrolment
   */
  async enrol({ studentId, studentName, courseId, actor }) {
    return this._atomicDispatch(async () => {
      const course = this.courses.find((c) => c.id === courseId);
      if (!course) {
        throw new Error(`Course '${courseId}' not found.`);
      }

      const isEnrolled = course.enrolled.includes(studentId);
      const isWaitlisted = course.waitlist.includes(studentId);

      if (isEnrolled || isWaitlisted) {
        return {
          success: false,
          error: "Duplicate request: Student is already registered in this course.",
          status: isEnrolled ? "ENROLLED" : "WAITLISTED",
        };
      }

      const hasSeat = course.enrolled.length < course.capacity;

      if (hasSeat) {
        course.enrolled.push(studentId);
      } else {
        course.waitlist.push(studentId);
      }

      const status = hasSeat ? "ENROLLED" : "WAITLISTED";
      const position = hasSeat ? 0 : course.waitlist.length;
      const actionText = hasSeat ? "Enrolment Confirmed (Server Sequencer)" : "Joined FIFO Waitlist (Server Sequencer)";
      const reasonText = hasSeat
        ? `${studentName || studentId} secured confirmed seat in ${course.code}. Deterministic sequence recorded.`
        : `${studentName || studentId} placed on ${course.code} waitlist at strict FIFO position #${position}.`;

      const auditBlock = await this._appendAuditBlock(
        actor || studentName || studentId,
        actionText,
        {
          courseId: course.id,
          courseCode: course.code,
          studentId,
          status,
          position,
        },
        reasonText
      );

      this.broadcastUpdate("COURSE_ENROLLED", { courseId, studentId, status });
      return { success: true, status, course, auditBlock };
    });
  }

  /**
   * Atomic Course Withdrawal & Instant FIFO Auto-Promotion
   */
  async withdraw({ studentId, studentName, courseId, actor }) {
    return this._atomicDispatch(async () => {
      const course = this.courses.find((c) => c.id === courseId);
      if (!course) throw new Error(`Course '${courseId}' not found.`);

      const wasEnrolled = course.enrolled.includes(studentId);
      const wasWaitlisted = course.waitlist.includes(studentId);

      if (!wasEnrolled && !wasWaitlisted) {
        return { success: false, error: "Student is neither enrolled nor waitlisted." };
      }

      course.enrolled = course.enrolled.filter((id) => id !== studentId);
      course.waitlist = course.waitlist.filter((id) => id !== studentId);

      await this._appendAuditBlock(
        actor || studentName || studentId,
        wasEnrolled ? "Course Withdrawal Processed" : "Removed from Waitlist",
        { courseId: course.id, courseCode: course.code, studentId },
        `${studentName || studentId} withdrew from ${course.code}. Seat released to pool.`
      );

      let promotedStudentId = null;
      if (wasEnrolled && course.waitlist.length > 0 && course.enrolled.length < course.capacity) {
        promotedStudentId = course.waitlist.shift();
        course.enrolled.push(promotedStudentId);

        const sObj = this.students.find((s) => s.id === promotedStudentId);
        await this._appendAuditBlock(
          "FairEnrol Automated FIFO Dispatcher",
          "⚡ FIFO Waitlist Auto-Promotion",
          {
            courseId: course.id,
            courseCode: course.code,
            promotedStudentId,
            promotedStudentName: sObj?.name,
          },
          `Seat vacated in ${course.code}. Position #1 candidate ${sObj?.name || promotedStudentId} automatically promoted to confirmed seat.`
        );
      }

      this.broadcastUpdate("COURSE_WITHDRAWN", { courseId, studentId, promotedStudentId });
      return { success: true, course, promotedStudentId };
    });
  }

  /**
   * Atomic Quota / Capacity Adjustment
   */
  async updateCapacity({ courseId, capacity, actor }) {
    return this._atomicDispatch(async () => {
      const course = this.courses.find((c) => c.id === courseId);
      if (!course) throw new Error(`Course '${courseId}' not found.`);

      const prevCap = course.capacity;
      const newCap = Math.max(1, Number(capacity) || 1);
      course.capacity = newCap;

      await this._appendAuditBlock(
        actor || "Registrar",
        "Course Quota Updated",
        { courseId: course.id, courseCode: course.code, previousCapacity: prevCap, newCapacity: newCap },
        `${course.code} class limit adjusted from ${prevCap} to ${newCap} seats by authorized registrar.`
      );

      const promoted = [];
      while (course.enrolled.length < course.capacity && course.waitlist.length > 0) {
        const studentToPromote = course.waitlist.shift();
        course.enrolled.push(studentToPromote);
        promoted.push(studentToPromote);

        const sObj = this.students.find((s) => s.id === studentToPromote);
        await this._appendAuditBlock(
          "FairEnrol Automated FIFO Dispatcher",
          "⚡ FIFO Capacity Release Promotion",
          {
            courseId: course.id,
            courseCode: course.code,
            promotedStudentId: studentToPromote,
          },
          `Capacity expansion in ${course.code} opened seat. Eligible waitlist candidate ${sObj?.name || studentToPromote} automatically promoted.`
        );
      }

      this.broadcastUpdate("CAPACITY_UPDATED", { courseId, newCapacity: newCap, promoted });
      return { success: true, course, promoted };
    });
  }

  /**
   * Submit Exception Proposal
   */
  async submitRequest({ request }) {
    return this._atomicDispatch(async () => {
      const newReq = {
        ...request,
        id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        status: "pending",
        approvals: [],
        rejections: [],
        createdAt: new Date().toISOString(),
      };

      this.requests.unshift(newReq);

      await this._appendAuditBlock(
        newReq.requester,
        `${newReq.kind.toUpperCase()} Proposal Submitted`,
        {
          requestId: newReq.id,
          kind: newReq.kind,
          studentId: newReq.studentId,
          hasE2EEEvidence: Boolean(newReq.confidentialEvidence),
        },
        `Public Justification: ${newReq.reason}${
          newReq.confidentialEvidence ? " [AES-GCM-256 E2EE Supporting Evidence Attached]" : ""
        }`
      );

      this.broadcastUpdate("REQUEST_SUBMITTED", { request: newReq });
      return { success: true, request: newReq };
    });
  }

  /**
   * Cast Approver Vote with Asymmetric ECDSA Verification
   */
  async vote({ approverId, approverName, requestId, decision, signatureProof }) {
    return this._atomicDispatch(async () => {
      const request = this.requests.find((r) => r.id === requestId);
      if (!request || request.status !== "pending") {
        throw new Error("Proposal not found or already finalized.");
      }

      // 1. Conflict of Interest Check (Self-Approval Prohibited)
      if (request.requesterId === approverId || request.requester === approverName) {
        await this._appendAuditBlock(
          approverName,
          "⛔ Self-Approval Blocked",
          { requestId: request.id },
          "Conflict of Interest: Requester cannot cast votes on their own exception proposal."
        );
        throw new Error("Conflict of Interest: You cannot vote on your own proposal.");
      }

      // 2. Prevent Double Voting
      const existingApprovals = request.approvals || [];
      const existingRejections = request.rejections || [];
      if (
        existingApprovals.some((v) => v.id === approverId) ||
        existingRejections.some((v) => v.id === approverId)
      ) {
        throw new Error("Duplicate Vote: Approver has already voted on this proposal.");
      }

      // 3. Cryptographic Signature Verification (NIST ECDSA P-256 / CWE-347 Check)
      const voteEntry = {
        id: approverId,
        requestId,
        decision,
        votedAt: signatureProof?.signedAt || new Date().toISOString(),
        signatureProof,
      };

      const verification = await verifyApproverVoteSignature(voteEntry);
      if (!verification.valid) {
        await this._appendAuditBlock(
          approverName,
          "⛔ Forged Vote Blocked (CWE-347)",
          { requestId, approverId, decision },
          `Cryptographic signature failure: ${verification.error}`
        );
        throw new Error(`Signature Verification Failed (CWE-347): ${verification.error}`);
      }

      // 4. Record Valid Vote
      const recordedVote = {
        id: approverId,
        name: approverName,
        decision,
        votedAt: voteEntry.votedAt,
        signatureProof,
      };

      if (decision === "approve") {
        existingApprovals.push(recordedVote);
      } else {
        existingRejections.push(recordedVote);
      }

      request.approvals = existingApprovals;
      request.rejections = existingRejections;

      await this._appendAuditBlock(
        approverName,
        `Panel Vote Cast (${decision === "approve" ? "Approve" : "Reject"})`,
        {
          requestId: request.id,
          approverId,
          decision,
          totalApprovals: existingApprovals.length,
          algorithm: signatureProof.algorithm,
        },
        `Vote verified via ${signatureProof.algorithm} by ${approverName} for ${request.kind}.`
      );

      // 5. Evaluate Quorum (2-of-3)
      if (existingApprovals.length >= 2) {
        request.status = "approved";
        // Apply action to course
        const targetCourse = this.courses.find((c) => c.id === request.courseId);
        if (targetCourse) {
          if (request.kind === "force") {
            targetCourse.enrolled = targetCourse.enrolled.filter((id) => id !== request.studentId);
            targetCourse.waitlist = targetCourse.waitlist.filter((id) => id !== request.studentId);
            targetCourse.enrolled.push(request.studentId);
          } else if (request.kind === "jump") {
            targetCourse.waitlist = targetCourse.waitlist.filter((id) => id !== request.studentId);
            targetCourse.waitlist.unshift(request.studentId);
          }
        }

        await this._appendAuditBlock(
          "FairEnrol Multi-Signature Quorum Engine",
          "✓ 2-of-3 Quorum Achieved: Exception Applied",
          {
            requestId: request.id,
            kind: request.kind,
            studentId: request.studentId,
            approvers: existingApprovals.map((a) => a.name),
          },
          `Exception authorized by ${existingApprovals.map((m) => m.name).join(" & ")}. Queue updated accordingly.`
        );
      } else if (existingRejections.length >= 2) {
        request.status = "denied";
        await this._appendAuditBlock(
          "FairEnrol Multi-Signature Quorum Engine",
          "✗ Exception Denied by Panel Consensus",
          { requestId: request.id, rejecters: existingRejections.map((a) => a.name) },
          `Proposal for ${request.kind} rejected by consensus (${existingRejections.map((m) => m.name).join(" & ")}).`
        );
      }

      this.broadcastUpdate("VOTE_RECORDED", { request });
      return { success: true, request };
    });
  }

  /**
   * Tamper Simulation on Ledger
   */
  async simulateTamper(mode = "single") {
    return this._atomicDispatch(async () => {
      if (this.audit.length < 2) return { success: false, error: "Not enough audit blocks to tamper." };

      if (mode === "single") {
        this.audit[1] = {
          ...this.audit[1],
          reason: "MALICIOUS TAMPER: Secretly altered by rogue administrator in server memory.",
          isTampered: true,
        };
      } else {
        // Rewrite
        for (let i = 1; i < this.audit.length; i++) {
          this.audit[i] = {
            ...this.audit[i],
            reason: "DATABASE REWRITE: Entire historical block rewritten by attacker.",
            isTampered: true,
          };
        }
      }

      this.isTampered = true;
      this.broadcastUpdate("LEDGER_TAMPERED", { mode });
      return { success: true, isTampered: true };
    });
  }

  /**
   * Restores clean ledger from trusted anchor
   */
  async restoreCleanLedger() {
    return this._atomicDispatch(async () => {
      this.resetState();
      this.broadcastUpdate("LEDGER_RESTORED");
      return { success: true, isTampered: false, message: "State and ledger restored to clean Genesis." };
    });
  }

  /**
   * Broadcasts Server-Sent Event (SSE) to all connected clients
   */
  broadcastUpdate(eventType, payload = {}) {
    const data = JSON.stringify({
      eventType,
      timestamp: new Date().toISOString(),
      payload,
      state: this.getState(),
    });

    for (const client of this.sseClients) {
      try {
        client.write(`event: fairenrol_sync\ndata: ${data}\n\n`);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Registers a client for Server-Sent Events (SSE)
   */
  registerSseClient(req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    res.write(`event: fairenrol_connected\ndata: ${JSON.stringify({ status: "connected" })}\n\n`);
    this.sseClients.add(res);

    req.on("close", () => {
      this.sseClients.delete(res);
    });
  }
}
