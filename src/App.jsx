import { useEffect, useMemo, useReducer, useState, useCallback } from "react";
import { useKeycloak, ProtectedRoute } from "./contexts/KeycloakContext";
import seed from "./seed.json";
import {
  computeAuditHash,
  canonicalJsonStringify,
  GENESIS_PREV_HASH,
} from "./services/crypto";
import { APPROVER_SECRET_KEY } from "./services/tidecloak";
import { analyzeFairness } from "./services/fairnessMonitor";

import Header from "./components/Header";
import CourseGrid from "./components/CourseGrid";
import RegistrarDashboard from "./components/RegistrarDashboard";
import ApproverDashboard from "./components/ApproverDashboard";
import RequestForm from "./components/RequestForm";
import EvidenceModal from "./components/EvidenceModal";
import AuditLogView from "./components/AuditLogView";
import ComparisonSection from "./components/ComparisonSection";
import TideCloakSetupModal from "./components/TideCloakSetupModal";
import FairnessMonitorView from "./components/FairnessMonitorView";

const initialPanel = [
  { id: "approver-1", name: "Dr. Amara Okafor", title: "Head of School" },
  { id: "approver-2", name: "Sam Williams", title: "Academic Advisor" },
  { id: "approver-3", name: "Alex Morgan", title: "Student Representative" },
];

const demoRegistrar = {
  id: "registrar-1",
  name: "Taylor Reed",
  title: "Registrar",
};

const actionNames = {
  force: "Force Enrol (Seat Capacity Exemption)",
  jump: "Priority Waitlist Insertion (Medical / Academic Need)",
  remove: "Course Enrolment Withdrawal",
  panel: "Change Approver Panel Membership",
};

// Initial Genesis and Quota audit blocks with canonical sequence numbering
const initialAuditEntries = [
  {
    seq: 2,
    id: "init-02",
    prevHash: "6c2b18aa2f8db5a6c382bb7cecf0bb3a2e379b3780d603a152ca3155ba15eec5",
    time: new Date(Date.now() - 1800000).toISOString(),
    actor: "Taylor Reed (Registrar)",
    action: "Course Quotas Published",
    details: { comp3100: 3, isys3414: 4, cosc2408: 3 },
    reason: "Course capacities set for COMP3100 (3 seats), ISYS3414 (4 seats), COSC2408 (3 seats).",
    hash: "0f4435882672fa69caae03da0e6d6eb56ce30dff712217c093aee97eef9f27ba",
  },
  {
    seq: 1,
    id: "init-01",
    prevHash: GENESIS_PREV_HASH,
    time: new Date(Date.now() - 3600000).toISOString(),
    actor: "FairEnrol System",
    action: "FIFO Registration System Initialized",
    details: { consensusQuorum: "2-of-3", encryption: "AES-GCM-256", hashing: "SHA-256" },
    reason: "Genesis enrollment block created. Strict FIFO waitlist algorithm deployed with 2-of-3 approver consensus requirement.",
    hash: "6c2b18aa2f8db5a6c382bb7cecf0bb3a2e379b3780d603a152ca3155ba15eec5",
  },
];

function applyApprovedAction(state, request) {
  if (request.kind === "panel") {
    return {
      ...state,
      panel: [
        ...state.panel.filter((m) => m.id !== request.replaceMember.id),
        request.candidate,
      ],
    };
  }

  const courses = state.courses.map((course) => {
    if (course.id !== request.courseId) return course;
    const enrolled = course.enrolled.filter((id) => id !== request.studentId);
    const waitlist = course.waitlist.filter((id) => id !== request.studentId);

    if (request.kind === "force") {
      return { ...course, enrolled: [...enrolled, request.studentId], waitlist };
    }
    if (request.kind === "jump") {
      return { ...course, enrolled, waitlist: [request.studentId, ...waitlist] };
    }
    if (request.kind === "remove") {
      // If student is removed, promote next in line if seats open
      let newEnrolled = enrolled;
      let newWaitlist = waitlist;
      if (newWaitlist.length > 0 && newEnrolled.length < course.capacity) {
        const [promoted, ...rest] = newWaitlist;
        newEnrolled = [...newEnrolled, promoted];
        newWaitlist = rest;
      }
      return { ...course, enrolled: newEnrolled, waitlist: newWaitlist };
    }
    return { ...course, enrolled, waitlist };
  });

  return { ...state, courses };
}

function reducer(state, event) {
  // 1. ENROL ACTION (Student self-service)
  if (event.type === "enrol") {
    const course = state.courses.find((item) => item.id === event.courseId);
    if (!course) return state;

    if (
      course.enrolled.includes(event.studentId) ||
      course.waitlist.includes(event.studentId)
    ) {
      return state; // Duplicate prevented
    }

    const hasSeat = course.enrolled.length < course.capacity;
    const courses = state.courses.map((item) =>
      item.id !== course.id
        ? item
        : hasSeat
        ? { ...item, enrolled: [...item.enrolled, event.studentId] }
        : { ...item, waitlist: [...item.waitlist, event.studentId] }
    );

    const actionText = hasSeat ? "Enrolment Confirmed" : "Joined FIFO Waitlist";
    const reasonText = hasSeat
      ? `${event.studentName} (${event.studentId}) enrolled in ${course.code}. Seat confirmed.`
      : `${event.studentName} (${event.studentId}) placed on ${course.code} waitlist in strict FIFO position #${course.waitlist.length + 1}.`;

    return {
      ...state,
      courses,
      pendingAuditQueue: [
        ...state.pendingAuditQueue,
        {
          actor: event.actor,
          action: actionText,
          details: {
            courseId: course.id,
            courseCode: course.code,
            studentId: event.studentId,
            status: hasSeat ? "ENROLLED" : "WAITLISTED",
            position: hasSeat ? 0 : course.waitlist.length + 1,
          },
          reason: reasonText,
        },
      ],
    };
  }

  // 2. WITHDRAW ACTION (Student drop or registrar withdrawal with auto-promotion)
  if (event.type === "withdraw") {
    const course = state.courses.find((item) => item.id === event.courseId);
    if (!course) return state;

    const wasEnrolled = course.enrolled.includes(event.studentId);
    const wasWaitlisted = course.waitlist.includes(event.studentId);

    if (!wasEnrolled && !wasWaitlisted) return state;

    let newEnrolled = course.enrolled.filter((id) => id !== event.studentId);
    let newWaitlist = course.waitlist.filter((id) => id !== event.studentId);
    let promotedStudentId = null;

    // FIFO invariant: If an enrolled seat is vacated and waitlist has students, promote earliest
    if (wasEnrolled && newWaitlist.length > 0 && newEnrolled.length < course.capacity) {
      promotedStudentId = newWaitlist[0];
      newEnrolled = [...newEnrolled, promotedStudentId];
      newWaitlist = newWaitlist.slice(1);
    }

    const courses = state.courses.map((c) =>
      c.id === course.id ? { ...c, enrolled: newEnrolled, waitlist: newWaitlist } : c
    );

    const pendingAudits = [
      {
        actor: event.actor,
        action: wasEnrolled ? "Course Withdrawal Processed" : "Removed from Waitlist",
        details: {
          courseId: course.id,
          courseCode: course.code,
          studentId: event.studentId,
        },
        reason: `${event.studentName || event.studentId} withdrew from ${course.code}. Seat released.`,
      },
    ];

    if (promotedStudentId) {
      const promotedStudent = state.students.find((s) => s.id === promotedStudentId);
      pendingAudits.push({
        actor: "FairEnrol Automated FIFO Dispatcher",
        action: "⚡ FIFO Waitlist Auto-Promotion",
        details: {
          courseId: course.id,
          courseCode: course.code,
          promotedStudentId,
          promotedStudentName: promotedStudent?.name,
        },
        reason: `Seat vacated in ${course.code}. Position #1 candidate ${promotedStudent?.name || promotedStudentId} automatically promoted to confirmed enrolment.`,
      });
    }

    return {
      ...state,
      courses,
      pendingAuditQueue: [...state.pendingAuditQueue, ...pendingAudits],
    };
  }

  // 3. CAPACITY UPDATE ACTION (With auto-promotion if seats increase)
  if (event.type === "capacity") {
    const targetCourse = state.courses.find((c) => c.id === event.courseId);
    if (!targetCourse) return state;

    const newCap = Math.max(1, Number(event.capacity) || 1);
    const prevCap = targetCourse.capacity;

    let newEnrolled = [...targetCourse.enrolled];
    let newWaitlist = [...targetCourse.waitlist];
    const promotedStudents = [];

    // If capacity expanded beyond current enrolled count, promote earliest waitlisted students
    if (newCap > newEnrolled.length && newWaitlist.length > 0) {
      const seatsToFill = Math.min(newCap - newEnrolled.length, newWaitlist.length);
      for (let i = 0; i < seatsToFill; i++) {
        const studentToPromote = newWaitlist.shift();
        newEnrolled.push(studentToPromote);
        promotedStudents.push(studentToPromote);
      }
    }

    const courses = state.courses.map((c) =>
      c.id === targetCourse.id
        ? { ...c, capacity: newCap, enrolled: newEnrolled, waitlist: newWaitlist }
        : c
    );

    const pendingAudits = [
      {
        actor: event.actor,
        action: "Course Quota Updated",
        details: {
          courseId: targetCourse.id,
          courseCode: targetCourse.code,
          previousCapacity: prevCap,
          newCapacity: newCap,
        },
        reason: `${targetCourse.code} class limit adjusted from ${prevCap} to ${newCap} seats by authorized registrar.`,
      },
    ];

    if (promotedStudents.length > 0) {
      promotedStudents.forEach((sId, index) => {
        const sObj = state.students.find((s) => s.id === sId);
        pendingAudits.push({
          actor: "FairEnrol Automated FIFO Dispatcher",
          action: "⚡ FIFO Capacity Release Promotion",
          details: {
            courseId: targetCourse.id,
            courseCode: targetCourse.code,
            promotedStudentId: sId,
            queuePositionPromoted: index + 1,
          },
          reason: `Capacity increase in ${targetCourse.code} opened seat. Eligible waitlist candidate ${sObj?.name || sId} automatically promoted.`,
        });
      });
    }

    return {
      ...state,
      courses,
      pendingAuditQueue: [...state.pendingAuditQueue, ...pendingAudits],
    };
  }

  // 4. ATOMIC CONCURRENCY SIMULATION
  if (event.type === "race_enrol") {
    const course = state.courses.find((c) => c.id === event.courseId);
    if (!course) return state;

    // Simulate 2 students hitting the server at the exact same millisecond for 1 seat
    const student1 = state.students.find((s) => s.id === event.studentId);
    const candidate2 = state.students.find(
      (s) => s.id !== event.studentId && !course.enrolled.includes(s.id) && !course.waitlist.includes(s.id)
    ) || { id: "s99", name: "Concurrent Contender" };

    const available = Math.max(0, course.capacity - course.enrolled.length);

    let updatedCourse;
    if (available > 0) {
      // Student 1 wins the atomic lock
      updatedCourse = {
        ...course,
        enrolled: [...course.enrolled, student1.id],
        waitlist: [...course.waitlist, candidate2.id],
      };
    } else {
      updatedCourse = {
        ...course,
        waitlist: [...course.waitlist, student1.id, candidate2.id],
      };
    }

    const courses = state.courses.map((c) => (c.id === course.id ? updatedCourse : c));

    return {
      ...state,
      courses,
      pendingAuditQueue: [
        ...state.pendingAuditQueue,
        {
          actor: "FairEnrol Atomic Lock Manager",
          action: "⚡ Concurrent Enrolment Handled",
          details: {
            courseId: course.id,
            courseCode: course.code,
            winner: student1.id,
            sequencedToWaitlist: candidate2.id,
          },
          reason: `Concurrent race for seat in ${course.code} resolved deterministically via atomic sequence lock. ${student1.name} claimed the open seat; ${candidate2.name} placed in position #${course.waitlist.length + 1} with zero over-enrolment.`,
        },
      ],
    };
  }

  // 5. BLOCKED ILLEGAL OVERRIDES
  if (event.type === "blocked") {
    return {
      ...state,
      pendingAuditQueue: [
        ...state.pendingAuditQueue,
        {
          actor: event.actor,
          action: "⛔ Unilateral Override Blocked",
          details: { policyViolation: true, overrideType: event.overrideType || "QUEUE_OR_GOVERNANCE" },
          reason: event.reason,
        },
      ],
    };
  }

  // 6. PROPOSAL SUBMISSION
  if (event.type === "request") {
    const request = {
      ...event.request,
      approvals: [],
      rejections: [],
      status: "pending",
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    };

    return {
      ...state,
      requests: [request, ...state.requests],
      pendingAuditQueue: [
        ...state.pendingAuditQueue,
        {
          actor: request.requester,
          action: `${actionNames[request.kind] || request.kind} Proposal Submitted`,
          details: {
            requestId: request.id,
            kind: request.kind,
            studentId: request.studentId,
            hasE2EEEvidence: Boolean(request.confidentialEvidence),
          },
          reason: `Public Justification: ${request.reason}${
            request.confidentialEvidence ? " [AES-GCM-256 E2EE Supporting Evidence Attached]" : ""
          }`,
        },
      ],
    };
  }

  // 7. APPROVER VOTE (Approve or Reject)
  if (event.type === "vote") {
    const request = state.requests.find((item) => item.id === event.requestId);
    if (!request || request.status !== "pending") return state;

    const isApprove = event.decision === "approve";
    const existingApprovals = request.approvals || [];
    const existingRejections = request.rejections || [];

    // Conflict of interest check (Self-Approval Prohibited)
    if (
      request.requesterId === event.approver.id ||
      request.requester === event.approver.name
    ) {
      return {
        ...state,
        pendingAuditQueue: [
          ...state.pendingAuditQueue,
          {
            actor: event.approver.name,
            action: "⛔ Self-Approval Blocked",
            details: { requestId: request.id },
            reason: "Conflict of Interest: Requester cannot cast votes on their own exception proposal.",
          },
        ],
      };
    }

    // Double voting check
    const hasAlreadyVoted =
      existingApprovals.some((m) => m.id === event.approver.id) ||
      existingRejections.some((m) => m.id === event.approver.id);

    if (hasAlreadyVoted) {
      return state;
    }

    const voteEntry = {
      id: event.approver.id,
      name: event.approver.name,
      title: event.approver.title,
      votedAt: new Date().toISOString(),
    };

    const nextApprovals = isApprove ? [...existingApprovals, voteEntry] : existingApprovals;
    const nextRejections = !isApprove ? [...existingRejections, voteEntry] : existingRejections;

    const quorumReached = nextApprovals.length >= 2;
    const rejectionQuorumReached = nextRejections.length >= 2;

    let updatedStatus = "pending";
    if (quorumReached) updatedStatus = "approved";
    else if (rejectionQuorumReached) updatedStatus = "denied";

    let nextState = {
      ...state,
      requests: state.requests.map((r) =>
        r.id === request.id
          ? {
              ...r,
              approvals: nextApprovals,
              rejections: nextRejections,
              status: updatedStatus,
            }
          : r
      ),
    };

    const pendingAudits = [
      {
        actor: event.approver.name,
        action: `Panel Vote Cast (${isApprove ? "Approve" : "Reject"})`,
        details: {
          requestId: request.id,
          approverId: event.approver.id,
          decision: event.decision,
          totalApprovals: nextApprovals.length,
          totalRejections: nextRejections.length,
        },
        reason: `Vote cast by ${event.approver.name} for ${actionNames[request.kind] || request.kind}. Public reason: ${request.reason}`,
      },
    ];

    if (quorumReached) {
      nextState = applyApprovedAction(nextState, { ...request, approvals: nextApprovals });
      pendingAudits.push({
        actor: "FairEnrol Multi-Signature Quorum Engine",
        action: "✓ 2-of-3 Quorum Achieved: Exception Applied",
        details: {
          requestId: request.id,
          kind: request.kind,
          studentId: request.studentId,
          approvers: nextApprovals.map((a) => a.name),
        },
        reason: `${actionNames[request.kind] || request.kind} authorized by ${nextApprovals.map((m) => m.name).join(" & ")}. Queue updated accordingly. Reason: ${request.reason}`,
      });
    } else if (rejectionQuorumReached) {
      pendingAudits.push({
        actor: "FairEnrol Multi-Signature Quorum Engine",
        action: "✗ Exception Denied by Panel Consensus",
        details: {
          requestId: request.id,
          rejecters: nextRejections.map((a) => a.name),
        },
        reason: `Proposal for ${actionNames[request.kind] || request.kind} rejected by multi-party consensus (${nextRejections.map((m) => m.name).join(" & ")}).`,
      });
    }

    return {
      ...nextState,
      pendingAuditQueue: [...state.pendingAuditQueue, ...pendingAudits],
    };
  }

  // 8. COMMIT HASHED AUDIT BLOCK
  if (event.type === "commit_audit") {
    const updatedAudit = [event.entry, ...state.audit];
    return {
      ...state,
      audit: updatedAudit,
      // Retain clean backup if not currently tampered
      cleanBackup: state.isTampered ? state.cleanBackup : updatedAudit,
      pendingAuditQueue: state.pendingAuditQueue.slice(1),
    };
  }

  // 9. SIMULATE SINGLE-BLOCK TAMPERING
  if (event.type === "tamper_single") {
    const targetIdx = Math.min(1, state.audit.length - 1);
    const tampered = state.audit.map((entry, index) => {
      if (index === targetIdx) {
        return {
          ...entry,
          reason: "MALICIOUS TAMPER: Registrar secretly forced friend into class without 2-of-3 quorum.",
          isTampered: true,
        };
      }
      return entry;
    });
    return {
      ...state,
      cleanBackup: state.cleanBackup || state.audit,
      audit: tampered,
      isTampered: true,
      tamperMode: "single",
      chainVerification: null,
    };
  }

  // 10. SIMULATE FULL-CHAIN REWRITE ATTACK
  if (event.type === "tamper_rewrite") {
    // Modify block 2 and rewrite all hashes to simulate an attacker who recalculates the chain in DB
    const tampered = state.audit.map((entry, index) => {
      if (index >= 1) {
        return {
          ...entry,
          reason: "DATABASE REWRITE: Unauthorized seat swap. Hashes recalculated by attacker.",
          isTampered: true,
        };
      }
      return entry;
    });
    return {
      ...state,
      cleanBackup: state.cleanBackup || state.audit,
      audit: tampered,
      isTampered: true,
      tamperMode: "rewrite",
      chainVerification: null,
    };
  }

  // 11. RESTORE CLEAN LEDGER
  if (event.type === "restore_audit") {
    return {
      ...state,
      audit: state.cleanBackup || initialAuditEntries,
      isTampered: false,
      tamperMode: null,
      chainVerification: null,
    };
  }

  // 12. UPDATE CHAIN VERIFICATION RESULT
  if (event.type === "set_verification_result") {
    return {
      ...state,
      chainVerification: event.result,
    };
  }

  return state;
}

export default function App() {
  const {
    authenticated,
    isInitializing,
    user,
    initError,
    login,
    logout,
    refreshToken,
    hasRealmRole,
    checkServerAlive,
  } = useKeycloak();

  const [state, dispatch] = useReducer(reducer, {
    courses: seed.courses,
    students: seed.students,
    panel: initialPanel,
    requests: [],
    audit: initialAuditEntries,
    cleanBackup: initialAuditEntries,
    pendingAuditQueue: [],
    isTampered: false,
    tamperMode: null,
    chainVerification: null,
  });

  const [role, setRole] = useState("student");
  const [studentId, setStudentId] = useState(seed.students[0].id);
  const [approverId, setApproverId] = useState(initialPanel[0].id);
  const [notice, setNotice] = useState("");
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [activeEvidenceRequest, setActiveEvidenceRequest] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard' | 'fairness_monitor'

  // Independent Anchor Checkpoint (Head hash of verified clean state)
  const checkpointHash = useMemo(() => {
    return state.cleanBackup[0]?.hash || "0f4435882672fa69caae03da0e6d6eb56ce30dff712217c093aee97eef9f27ba";
  }, [state.cleanBackup]);

  // Compute canonical hash for the next item in the pending audit queue
  useEffect(() => {
    if (state.pendingAuditQueue.length === 0) return;

    let isMounted = true;
    const nextItem = state.pendingAuditQueue[0];
    const prevBlock = state.audit[0];
    const prevHash = prevBlock ? prevBlock.hash : GENESIS_PREV_HASH;
    const nextSeq = prevBlock ? (prevBlock.seq ?? 1) + 1 : 1;

    const entryId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newEntry = {
      seq: nextSeq,
      id: entryId,
      prevHash,
      time: new Date().toISOString(),
      actor: nextItem.actor,
      action: nextItem.action,
      details: nextItem.details || {},
      reason: nextItem.reason,
    };

    computeAuditHash(prevHash, newEntry).then((hash) => {
      if (isMounted) {
        dispatch({
          type: "commit_audit",
          entry: { ...newEntry, hash },
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [state.pendingAuditQueue, state.audit]);

  // Auto-align persona view if user logs in with Keycloak realm roles
  useEffect(() => {
    if (user) {
      if (user.hasRegistrarRole) {
        setRole("registrar");
      } else if (user.hasApproverRole) {
        setRole("approver");
      } else if (user.hasStudentRole) {
        setRole("student");
      }
    }
  }, [user]);

  const activeApprover =
    state.panel.find((m) => m.id === approverId) ?? state.panel[0];

  const currentStudent =
    state.students.find((s) => s.id === studentId) ?? state.students[0];

  const currentActor =
    role === "registrar"
      ? demoRegistrar
      : role === "approver"
      ? activeApprover
      : currentStudent;

  const tokenDisplayName = user?.name || user?.username || "";

  // Evaluate Explainable Fairness Monitor rules
  const fairnessAlerts = useMemo(() => {
    return analyzeFairness({
      courses: state.courses,
      requests: state.requests,
      auditLog: state.audit,
      chainVerification: state.chainVerification,
    });
  }, [state.courses, state.requests, state.audit, state.chainVerification]);

  // Handlers
  async function handleLogin() {
    setIsLoggingIn(true);
    const isOnline = await checkServerAlive();

    if (!isOnline) {
      setIsLoggingIn(false);
      setNotice(
        "Máy chủ xác thực tại cổng 8081 chưa phản hồi. Đã mở hướng dẫn. Bạn có thể sử dụng thanh công cụ DEMO PERSONA bên dưới để trải nghiệm ngay."
      );
      setIsSetupModalOpen(true);
      return;
    }

    try {
      await login();
    } catch (err) {
      setIsLoggingIn(false);
      setNotice(
        `Lỗi đăng nhập: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  function handleJoinCourse(course) {
    dispatch({
      type: "enrol",
      courseId: course.id,
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      actor: currentActor.name,
    });
    setNotice("Course action processed in strict FIFO waitlist queue.");
  }

  function handleWithdrawCourse(courseId, studentId) {
    const student = state.students.find((s) => s.id === studentId);
    dispatch({
      type: "withdraw",
      courseId,
      studentId,
      studentName: student?.name,
      actor: currentActor.name,
    });
    setNotice("Course withdrawal processed. Automated FIFO promotion triggered for next student.");
  }

  function handleSimulateConcurrentEnrol(courseId, studentId) {
    dispatch({
      type: "race_enrol",
      courseId,
      studentId,
    });
    setNotice("Simultaneous race condition resolved deterministically via atomic lock.");
  }

  function handleUpdateCapacity(courseId, newCapacity, actor) {
    dispatch({
      type: "capacity",
      courseId,
      capacity: newCapacity,
      actor,
    });
    setNotice(`Course quota updated to ${newCapacity} seats. Auto-promotion applied if seats freed.`);
  }

  function handleTriggerPromotions() {
    // Sweep each course and check if open seats exist with waitlisted students
    let promotedCount = 0;
    state.courses.forEach((c) => {
      const openSeats = Math.max(0, c.capacity - c.enrolled.length);
      if (openSeats > 0 && c.waitlist.length > 0) {
        dispatch({
          type: "capacity",
          courseId: c.id,
          capacity: c.capacity,
          actor: "FairEnrol Automated Sweep",
        });
        promotedCount += Math.min(openSeats, c.waitlist.length);
      }
    });

    setNotice(
      promotedCount > 0
        ? `FIFO Promotion sweep complete: ${promotedCount} waitlisted student(s) promoted.`
        : "All courses are already balanced. Zero stalled waitlists."
    );
  }

  function handleAttemptRegistrarOverrides() {
    dispatch({
      type: "blocked",
      actor: demoRegistrar.name,
      overrideType: "QUEUE_MANIPULATION",
      reason:
        "Registrar attempted to manually move a favored student to position #1. Rejected: Queue ordering is governed strictly by cryptographic FIFO.",
    });
    dispatch({
      type: "blocked",
      actor: demoRegistrar.name,
      overrideType: "PANEL_MANIPULATION",
      reason:
        "Registrar attempted to unilaterally modify the approver board. Rejected: Governance changes mandate a 2-of-3 quorum vote.",
    });
    setNotice(
      "Both illegal override attempts were blocked by FairEnrol governance policy. Recorded in the tamper-evident ledger."
    );
  }

  function handleSubmitRequest(requestData) {
    dispatch({
      type: "request",
      request: requestData,
    });
    setNotice("Exception proposal broadcast to the independent Approver Panel with E2EE evidence.");
  }

  function handleVote(requestId, approver) {
    dispatch({
      type: "vote",
      requestId,
      approver,
      decision: "approve",
    });
    setNotice(`Consensus approval vote recorded by ${approver.name}.`);
  }

  function handleRejectVote(requestId, approver) {
    dispatch({
      type: "vote",
      requestId,
      approver,
      decision: "reject",
    });
    setNotice(`Consensus rejection vote recorded by ${approver.name}.`);
  }

  function handleCustomAudit(actor, action, reason) {
    dispatch({
      type: "blocked",
      actor,
      reason: `${action}: ${reason}`,
    });
  }

  const approvedRequests = useMemo(
    () => state.requests.filter((r) => r.status === "approved"),
    [state.requests]
  );

  return (
    <main className="shell">
      <Header
        authenticated={authenticated}
        tokenName={tokenDisplayName}
        userProfile={user}
        isLoggingIn={isLoggingIn}
        onLogin={handleLogin}
        onLogout={logout}
        onOpenSetup={() => setIsSetupModalOpen(true)}
      />

      <section className="hero">
        <div>
          <div className="eyebrow">
            <span /> VERIFIABLE COURSE REGISTRATION · ZERO FAVOURS
          </div>
          <h1>
            A fair place
            <br />
            in every queue.
          </h1>
          <p>
            Strict first-come, first-served enrolment. Queue bypasses and administrative exceptions
            are mathematically transparent and require independent 2-of-3 collective consensus.
          </p>
        </div>

        <div className="hero-card">
          <span className="card-kicker">THE SECURITY PROMISE</span>
          <strong>
            No single administrator
            <br />
            can move the line.
          </strong>
          <div className="avatar-stack">
            {state.panel.map((member, index) => (
              <span
                key={member.id}
                className={`avatar a${index}`}
                title={`${member.name} (${member.title})`}
              >
                {member.name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(-2)
                  .join("")}
              </span>
            ))}
          </div>
          <small>Independent Approver Panel · 2 of 3 Consensus</small>
        </div>
      </section>

      {/* Primary Navigation Tabs */}
      <nav className="main-tab-nav" aria-label="Main Navigation">
        <button
          className={`main-tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          🎓 University Portal & Role Workflows
        </button>
        <button
          className={`main-tab-btn ${activeTab === "fairness_monitor" ? "active" : ""}`}
          onClick={() => setActiveTab("fairness_monitor")}
        >
          🔍 Explainable Fairness Monitor
          {fairnessAlerts.some((a) => a.severity === "CRITICAL" || a.severity === "WARNING") && (
            <span className="tab-alert-badge">!</span>
          )}
        </button>
      </nav>

      {/* Session Status Indicator */}
      {authenticated ? (
        <div className="demo-warning live-tide-connected">
          <span className="live-dot" />
          <div style={{ flex: 1 }}>
            <strong>LIVE TIDECLOAK SESSION ACTIVE</strong>
            <div style={{ marginTop: "2px" }}>
              Identity: <strong>{tokenDisplayName}</strong> ({user?.email || "verified token"}) | Roles:{" "}
              <strong>{user?.roles?.join(", ") || "student"}</strong>
            </div>
          </div>
          <button
            className="button outline mini"
            onClick={async () => {
              const refreshed = await refreshToken();
              setNotice(
                refreshed
                  ? "✓ Access token refreshed successfully via PKCE!"
                  : "Token is still active."
              );
            }}
          >
            Refresh Token
          </button>
        </div>
      ) : (
        <div className="demo-warning">
          <span>DEMO MODE</span>
          TideCloak / Keycloak OIDC login is real when configured. The role switcher and 2-of-3 exception flow below are local simulations, not Tide-enforced authorization.
        </div>
      )}

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}

      {/* Role Navigation Toolbar (Active in Dashboard Tab) */}
      {activeTab === "dashboard" && (
        <section className="toolbar">
          <div>
            <label htmlFor="role-select">DEMO PERSONA</label>
            <select
              id="role-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="student">Student (Enrol & Check Queue)</option>
              <option value="registrar">Registrar (Admin & Quotas)</option>
              <option value="approver">Approver (2-of-3 Panel Review)</option>
            </select>

            {role === "student" && (
              <select
                aria-label="Select Demo Student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                {state.students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} ({student.id})
                  </option>
                ))}
              </select>
            )}

            {role === "approver" && (
              <select
                aria-label="Select Demo Approver Member"
                value={activeApprover?.id ?? ""}
                onChange={(e) => setApproverId(e.target.value)}
              >
                {state.panel.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {member.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="role-hint">
            {authenticated
              ? `Signed in as ${tokenDisplayName} · Keycloak roles: ${user?.roles?.join(", ") || "student"}`
              : "Sign in with Keycloak / TideCloak above to link your live OpenID Connect identity."}
          </div>
        </section>
      )}

      {/* DASHBOARD TAB CONTENT */}
      {activeTab === "dashboard" && (
        <>
          {/* Dynamic Persona Dashboard */}
          {role === "student" && (
            <CourseGrid
              courses={state.courses}
              studentId={currentStudent.id}
              studentName={currentStudent.name}
              onJoinCourse={handleJoinCourse}
              onWithdrawCourse={handleWithdrawCourse}
              onSimulateConcurrentEnrol={handleSimulateConcurrentEnrol}
              approvedRequests={approvedRequests}
              actionNames={actionNames}
              auditHistory={state.audit}
            />
          )}

          {role === "registrar" && (
            <RegistrarDashboard
              courses={state.courses}
              actorName={demoRegistrar.name}
              onUpdateCapacity={handleUpdateCapacity}
              onAttemptOverrides={handleAttemptRegistrarOverrides}
              onTriggerPromotions={handleTriggerPromotions}
              RequestFormComponent={({ registrar }) => (
                <RequestForm
                  courses={state.courses}
                  students={state.students}
                  panel={state.panel}
                  actionNames={actionNames}
                  demoRegistrar={demoRegistrar}
                  requesterName={demoRegistrar.name}
                  requesterId={demoRegistrar.id}
                  onSubmitRequest={handleSubmitRequest}
                  registrar={registrar}
                />
              )}
            />
          )}

          {role === "approver" && (
            <ApproverDashboard
              panel={state.panel}
              activeApprover={activeApprover}
              requests={state.requests}
              courses={state.courses}
              students={state.students}
              actionNames={actionNames}
              onVote={handleVote}
              onRejectVote={handleRejectVote}
              onInspectEvidence={(req) => setActiveEvidenceRequest(req)}
              RequestFormComponent={({ registrar }) => (
                <RequestForm
                  courses={state.courses}
                  students={state.students}
                  panel={state.panel}
                  actionNames={actionNames}
                  demoRegistrar={demoRegistrar}
                  requesterName={activeApprover.name}
                  requesterId={activeApprover.id}
                  onSubmitRequest={handleSubmitRequest}
                  registrar={registrar}
                />
              )}
            />
          )}
        </>
      )}

      {/* FAIRNESS MONITOR TAB CONTENT */}
      {activeTab === "fairness_monitor" && (
        <FairnessMonitorView
          alerts={fairnessAlerts}
          courses={state.courses}
          auditCount={state.audit.length}
          onResolveStalledQueue={handleTriggerPromotions}
        />
      )}

      {/* Architectural Comparison Section */}
      <ComparisonSection />

      {/* Hash-Chained Public Audit Trail */}
      <AuditLogView
        auditList={state.audit}
        checkpointHash={checkpointHash}
        onTamperSingle={() => dispatch({ type: "tamper_single" })}
        onTamperFullRewrite={() => dispatch({ type: "tamper_rewrite" })}
        onRestore={() => dispatch({ type: "restore_audit" })}
        isTampered={state.isTampered}
        tamperMode={state.tamperMode}
        onVerificationResultChange={(result) =>
          dispatch({ type: "set_verification_result", result })
        }
      />

      <footer>
        <span>FairEnrol · RMIT Hackathon 2026 Prototype · Keycloak & TideCloak Integrated</span>
        <span>Standard Authorization Code Flow with PKCE (S256) · W3C Web Crypto AES-GCM-256 + SHA-256</span>
      </footer>

      {/* Evidence Decryption Modal */}
      <EvidenceModal
        isOpen={Boolean(activeEvidenceRequest)}
        onClose={() => setActiveEvidenceRequest(null)}
        request={activeEvidenceRequest}
        userRole={role}
        activeApprover={activeApprover}
        onAuditLog={handleCustomAudit}
      />

      {/* Keycloak / Tide Setup Modal */}
      <TideCloakSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        onReload={() => location.reload()}
        initError={initError}
      />
    </main>
  );
}
