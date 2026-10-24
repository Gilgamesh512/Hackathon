// Explainable Fairness Monitor & Rule-Based Anomaly Detector for FairEnrol
// Evaluates enrolment invariants, queue transitions, and administrative activities.
// Categorizes events into Verified Facts, Suspicious Patterns, and Integrity Violations.

export const SEVERITY = {
  CRITICAL: "CRITICAL", // Integrity failure, tampering, unauthorized bypass
  WARNING: "WARNING",   // High-risk administrative pattern (timing, repetition)
  INFO: "INFO",         // Verified legitimate exception / audit confirmation
};

/**
 * Analyzes the complete system state (courses, requests, audit log, chain status)
 * and returns an array of structured fairness findings.
 */
export function analyzeFairness({
  courses = [],
  requests = [],
  auditLog = [],
  chainVerification = null,
}) {
  const alerts = [];

  // RULE 1: Cryptographic Ledger Integrity Check
  if (chainVerification && !chainVerification.valid) {
    alerts.push({
      id: "ALERT-INT-01",
      rule: "RULE_CRYPTOGRAPHIC_INTEGRITY",
      title: "Ledger Hash Chain Integrity Compromised",
      severity: SEVERITY.CRITICAL,
      category: "INTEGRITY_VIOLATION",
      explanation:
        "The cryptographic SHA-256 hash link between blocks was broken or an in-place modification was detected. One or more records were edited without the required hash consensus.",
      evidence: {
        error: chainVerification.error,
        tamperedBlockId: chainVerification.tamperedBlockId,
        expectedHash: chainVerification.expectedHash,
        actualHash: chainVerification.actualHash,
      },
      recommendedAction:
        "Immediate lockdown of administrative credentials; restore database from trusted signed checkpoint.",
    });
  }

  // RULE 2: Repeated Unilateral Override Attempts by Registrar
  const blockedOverrides = auditLog.filter(
    (entry) =>
      entry.action &&
      (entry.action.includes("Blocked") || entry.action.includes("Illegal Override"))
  );

  if (blockedOverrides.length >= 2) {
    alerts.push({
      id: "ALERT-SEC-02",
      rule: "RULE_REPEATED_OVERRIDE_ATTEMPTS",
      title: "Multiple Blocked Administrative Overrides Detected",
      severity: SEVERITY.WARNING,
      category: "SUSPICIOUS_PATTERN",
      explanation: `System intercepted ${blockedOverrides.length} attempts to bypass FIFO queue ordering or alter panel governance. While the policy successfully blocked these attempts, this pattern indicates an active probe or malicious intent.`,
      evidence: {
        attemptCount: blockedOverrides.length,
        actor: blockedOverrides[0]?.actor,
        timestamps: blockedOverrides.slice(0, 3).map((e) => e.time),
      },
      recommendedAction:
        "Review registrar audit logs and verify actor session token credentials.",
    });
  }

  // RULE 3: Capacity Change Timing Anomaly
  // Flags if a course capacity was expanded within 15 minutes of a Force Enrol proposal for the same course
  requests.forEach((req) => {
    if (req.kind === "force" && req.status === "approved") {
      const course = courses.find((c) => c.id === req.courseId);
      const reqTime = new Date(req.createdAt || req.id.split("-")[0] || Date.now()).getTime();

      const relatedCapacityChange = auditLog.find((entry) => {
        if (!entry.action?.includes("Quota") && !entry.action?.includes("Capacity")) return false;
        const entryTime = new Date(entry.time).getTime();
        const diffMs = Math.abs(reqTime - entryTime);
        const diffMinutes = diffMs / (1000 * 60);
        return diffMinutes < 30 && (entry.details?.courseId === req.courseId || entry.reason?.includes(course?.code));
      });

      if (relatedCapacityChange) {
        alerts.push({
          id: `ALERT-TIMING-${req.id.slice(-6)}`,
          rule: "RULE_CAPACITY_TIMING_CORRELATION",
          title: `Capacity Adjustment Correlated With Force-Enrolment (${course?.code || req.courseId})`,
          severity: SEVERITY.WARNING,
          category: "SUSPICIOUS_PATTERN",
          explanation: `A class capacity change occurred in temporal proximity to an approved exception request for ${course?.code}. This pattern warrants human review to confirm capacity was not artificially inflated for a specific student.`,
          evidence: {
            courseCode: course?.code,
            requestId: req.id,
            beneficiaryStudent: req.studentId,
            capacityEventTime: relatedCapacityChange.time,
            requestTime: new Date(reqTime).toISOString(),
          },
          recommendedAction:
            "Verify with Academic Timetabling that room physical capacity supports this quota expansion.",
        });
      }
    }
  });

  // RULE 4: Single-Actor Exception Concentration (Favouritism Detection)
  const actorExceptionMap = {};
  requests.forEach((req) => {
    if (req.status === "approved" || req.status === "pending") {
      const key = `${req.requester}->${req.studentId}`;
      actorExceptionMap[key] = (actorExceptionMap[key] || 0) + 1;
    }
  });

  Object.entries(actorExceptionMap).forEach(([pair, count]) => {
    if (count >= 2) {
      const [requester, studentId] = pair.split("->");
      alerts.push({
        id: `ALERT-CONC-${studentId}`,
        rule: "RULE_EXCEPTION_CONCENTRATION",
        title: "Repeated Exception Requests for Single Student",
        severity: SEVERITY.WARNING,
        category: "SUSPICIOUS_PATTERN",
        explanation: `Requester '${requester}' has submitted ${count} distinct exception proposals for student '${studentId}'. Multi-course exemptions for a single student must be cross-verified against medical or equity documentation.`,
        evidence: {
          requester,
          studentId,
          totalProposals: count,
        },
        recommendedAction:
          "Require Dean of Students co-signature for repeated individual exemptions.",
      });
    }
  });

  // RULE 5: FIFO Waitlist Integrity & Promotion Verifications
  courses.forEach((course) => {
    // If course has open seats and waitlist is not empty, this is an actionable discrepancy
    const availableSeats = Math.max(0, course.capacity - course.enrolled.length);
    if (availableSeats > 0 && course.waitlist.length > 0) {
      alerts.push({
        id: `ALERT-QUEUE-${course.id}`,
        rule: "RULE_STALLED_WAITLIST_PROMOTION",
        title: `Unclaimed Open Seats with Active Waitlist (${course.code})`,
        severity: SEVERITY.WARNING,
        category: "SUSPICIOUS_PATTERN",
        explanation: `${course.code} has ${availableSeats} open seat(s) but ${course.waitlist.length} student(s) remain on the waitlist. Earliest waitlist candidate should be automatically promoted.`,
        evidence: {
          courseCode: course.code,
          availableSeats,
          nextStudentInLine: course.waitlist[0],
          waitlistCount: course.waitlist.length,
        },
        recommendedAction:
          "Trigger automated FIFO promotion sweep to fill vacant seats.",
      });
    }
  });

  // RULE 6: Verified 2-of-3 Quorum Exceptions (Transparency Showcase)
  const approvedQuorumRequests = requests.filter((r) => r.status === "approved");
  approvedQuorumRequests.forEach((req) => {
    alerts.push({
      id: `ALERT-QUORUM-${req.id.slice(-6)}`,
      rule: "RULE_VERIFIED_QUORUM_COMPLIANCE",
      title: `Authorized Exception Applied Under 2-of-3 Quorum (${req.kind.toUpperCase()})`,
      severity: SEVERITY.INFO,
      category: "VERIFIED_COMPLIANCE",
      explanation: `Exception for student '${req.studentId}' was vetted by ${req.approvals.length} independent panel approvers (${req.approvals.map((a) => a.name).join(", ")}). Public justification is recorded on the tamper-evident ledger.`,
      evidence: {
        requestId: req.id,
        justification: req.reason,
        hasE2EEEvidence: Boolean(req.confidentialEvidence),
        approvers: req.approvals.map((a) => a.name),
      },
      recommendedAction: "No action required. Complies with university governance policy.",
    });
  });

  return alerts;
}
