import { useEffect, useMemo, useReducer, useState } from "react";
import { useKeycloak, ProtectedRoute } from "./contexts/KeycloakContext";
import seed from "./seed.json";
import { computeAuditHash } from "./services/crypto";
// Keep TideCloak helper available for reference/hybrid usage
import { APPROVER_SECRET_KEY } from "./services/tidecloak";

import Header from "./components/Header";
import CourseGrid from "./components/CourseGrid";
import RegistrarDashboard from "./components/RegistrarDashboard";
import ApproverDashboard from "./components/ApproverDashboard";
import RequestForm from "./components/RequestForm";
import EvidenceModal from "./components/EvidenceModal";
import AuditLogView from "./components/AuditLogView";
import ComparisonSection from "./components/ComparisonSection";
import TideCloakSetupModal from "./components/TideCloakSetupModal";

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

// Seed audit records with initial chained hashes
const initialAuditEntries = [
  {
    id: "init-01",
    time: new Date(Date.now() - 3600000).toISOString(),
    actor: "FairEnrol System",
    action: "FIFO Registration System Initialized",
    reason: "Genesis enrollment block created. Strict FIFO waitlist algorithm deployed with 2-of-3 approver consensus requirement.",
    hash: "8f5a2b1c4e7d9a0f3e2d1c5b8a7f6e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f",
  },
  {
    id: "init-02",
    time: new Date(Date.now() - 1800000).toISOString(),
    actor: "Taylor Reed (Registrar)",
    action: "Course Quotas Published",
    reason: "Course capacities set for COMP3100 (3 seats), ISYS3414 (4 seats), COSC2408 (3 seats).",
    hash: "a4c8e1f2b3d4e5a6f7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
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
    return { ...course, enrolled, waitlist };
  });

  return { ...state, courses };
}

function reducer(state, event) {
  if (event.type === "enrol") {
    const course = state.courses.find((item) => item.id === event.courseId);
    if (
      course.enrolled.includes(event.studentId) ||
      course.waitlist.includes(event.studentId)
    ) {
      return state;
    }
    const hasSeat = course.enrolled.length < course.capacity;
    const courses = state.courses.map((item) =>
      item.id !== course.id
        ? item
        : hasSeat
        ? { ...item, enrolled: [...item.enrolled, event.studentId] }
        : { ...item, waitlist: [...item.waitlist, event.studentId] }
    );

    const actionText = hasSeat ? "Enrolment Recorded" : "Joined FIFO Waitlist";
    const reasonText = hasSeat
      ? `${event.studentName} enrolled in ${course.code}. Seat confirmed.`
      : `${event.studentName} joined ${course.code} waitlist in strict FIFO position #${course.waitlist.length + 1}.`;

    return {
      ...state,
      courses,
      pendingAudit: {
        actor: event.actor,
        action: actionText,
        reason: reasonText,
      },
    };
  }

  if (event.type === "capacity") {
    const courses = state.courses.map((course) =>
      course.id === event.courseId
        ? { ...course, capacity: Math.max(1, Number(event.capacity) || 1) }
        : course
    );
    const course = state.courses.find((item) => item.id === event.courseId);

    return {
      ...state,
      courses,
      pendingAudit: {
        actor: event.actor,
        action: "Course Quota Updated",
        reason: `${course.code} maximum seat limit set to ${event.capacity} by authorized registrar.`,
      },
    };
  }

  if (event.type === "blocked") {
    return {
      ...state,
      pendingAudit: {
        actor: event.actor,
        action: "⛔ Unilateral Override Blocked",
        reason: event.reason,
      },
    };
  }

  if (event.type === "request") {
    const request = {
      ...event.request,
      approvals: [],
      status: "pending",
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    };

    return {
      ...state,
      requests: [request, ...state.requests],
      pendingAudit: {
        actor: request.requester,
        action: `${actionNames[request.kind] || request.kind} Requested`,
        reason: `Public Justification: ${request.reason}${
          request.confidentialEvidence ? " [E2EE Medical Evidence Attached]" : ""
        }`,
      },
    };
  }

  if (event.type === "vote") {
    const request = state.requests.find((item) => item.id === event.requestId);
    if (!request || request.status !== "pending") return state;

    if (
      request.requester === event.approver.name ||
      !state.panel.some((m) => m.id === event.approver.id) ||
      request.approvals.some((m) => m.id === event.approver.id)
    ) {
      return {
        ...state,
        pendingAudit: {
          actor: event.approver.name,
          action: "Approval Blocked",
          reason:
            "Self-approval prohibited. Panel members cannot vote for their own request, nor vote multiple times.",
        },
      };
    }

    const approvals = [...request.approvals, event.approver];
    let next = {
      ...state,
      requests: state.requests.map((item) =>
        item.id === request.id ? { ...item, approvals } : item
      ),
      pendingAudit: {
        actor: event.approver.name,
        action: "Panel Vote Cast",
        reason: `Vote ${approvals.length} of 2 cast for ${actionNames[request.kind] || request.kind}. Justification: ${request.reason}`,
      },
    };

    if (approvals.length >= 2) {
      const approvedRequest = { ...request, approvals };
      next = applyApprovedAction(next, approvedRequest);
      next = {
        ...next,
        requests: next.requests.map((item) =>
          item.id === request.id
            ? { ...item, approvals, status: "approved" }
            : item
        ),
        pendingAudit: {
          actor: "FairEnrol Multi-Signature Engine",
          action: "✓ 2-of-3 Quorum Achieved: Exception Applied",
          reason: `${actionNames[request.kind] || request.kind} approved by ${approvals
            .map((m) => m.name)
            .join(" & ")}. Queue updated. Reason: ${request.reason}`,
        },
      };
    }

    return next;
  }

  if (event.type === "deny") {
    const request = state.requests.find((item) => item.id === event.requestId);
    if (!request || request.status !== "pending") return state;

    return {
      ...state,
      requests: state.requests.map((item) =>
        item.id === request.id ? { ...item, status: "denied" } : item
      ),
      pendingAudit: {
        actor: event.actor,
        action: "Exception Denied by Panel",
        reason: `${event.reason} Initial justification: ${request.reason}`,
      },
    };
  }

  if (event.type === "commit_audit") {
    return {
      ...state,
      audit: [event.entry, ...state.audit],
      pendingAudit: null,
    };
  }

  if (event.type === "tamper_audit") {
    const tampered = state.audit.map((entry, index) => {
      if (index === 1) {
        return {
          ...entry,
          reason: "HACKER TAMPERED: Secretly assigned friend to seat without public approval.",
          isTampered: true,
        };
      }
      return entry;
    });
    return { ...state, audit: tampered, isTampered: true };
  }

  if (event.type === "restore_audit") {
    const restored = state.audit.map((entry) => {
      if (entry.isTampered) {
        return {
          ...entry,
          reason: "Course capacities set for COMP3100 (3 seats), ISYS3414 (4 seats), COSC2408 (3 seats).",
          isTampered: false,
        };
      }
      return entry;
    });
    return { ...state, audit: restored, isTampered: false };
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
    pendingAudit: null,
    isTampered: false,
  });

  const [role, setRole] = useState("student");
  const [studentId, setStudentId] = useState(seed.students[0].id);
  const [approverId, setApproverId] = useState(initialPanel[0].id);
  const [notice, setNotice] = useState("");
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [activeEvidenceRequest, setActiveEvidenceRequest] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Asynchronously compute hash chain when a pending audit entry is created
  useEffect(() => {
    if (!state.pendingAudit) return;

    let isMounted = true;
    const prevHash =
      state.audit[0]?.hash ||
      "GENESIS_BLOCK_00000000000000000000000000000000000000000000000000000000";
    const entryId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newEntry = {
      id: entryId,
      time: new Date().toISOString(),
      actor: state.pendingAudit.actor,
      action: state.pendingAudit.action,
      reason: state.pendingAudit.reason,
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
  }, [state.pendingAudit]);

  // Auto-align persona view if user has explicit Keycloak realm roles
  useEffect(() => {
    if (user) {
      if (user.hasRegistrarRole) {
        setRole("registrar");
      } else if (user.hasApproverRole) {
        setRole("approver");
      }
    }
  }, [user]);

  const activeApprover =
    state.panel.find((m) => m.id === approverId) ?? state.panel[0];

  const currentActor =
    role === "registrar"
      ? demoRegistrar
      : role === "approver"
      ? activeApprover
      : state.students.find((s) => s.id === studentId);

  const tokenDisplayName = user?.name || user?.username || "";

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
    const student = state.students.find((s) => s.id === studentId);
    dispatch({
      type: "enrol",
      courseId: course.id,
      studentId,
      studentName: student?.name || studentId,
      actor: currentActor.name,
    });
    setNotice("Course action processed in strict FIFO waitlist queue.");
  }

  function handleUpdateCapacity(courseId, newCapacity, actor) {
    dispatch({
      type: "capacity",
      courseId,
      capacity: newCapacity,
      actor,
    });
    setNotice(`Course quota updated to ${newCapacity} seats.`);
  }

  function handleAttemptRegistrarOverrides() {
    dispatch({
      type: "blocked",
      actor: demoRegistrar.name,
      reason:
        "Registrar cannot manually reorder a queue or move a student to the front; queue changes require either natural FIFO succession or a publicly justified 2-of-3 panel quorum.",
    });
    dispatch({
      type: "blocked",
      actor: demoRegistrar.name,
      reason:
        "Registrar cannot unilaterally modify the approver panel; panel changes strictly mandate a 2-of-3 independent quorum vote.",
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
    setNotice("Exception request broadcast to the independent Approver Panel.");
  }

  function handleVote(requestId, approver) {
    dispatch({
      type: "vote",
      requestId,
      approver,
    });
    setNotice(`Consensus vote recorded by ${approver.name}.`);
  }

  function handleDeny(requestId, actorName) {
    dispatch({
      type: "deny",
      requestId,
      actor: actorName,
      reason: "Panel consensus declined this exception request.",
    });
    setNotice("Exception request denied and logged to ledger.");
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
          TideCloak login is real when configured. The role switcher and 2-of-3 exception flow below are local simulations, not Tide-enforced authorization.
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

      {/* Role Navigation Toolbar */}
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
            : "Sign in with Keycloak above to link your live OpenID Connect identity."}
        </div>
      </section>

      {/* Dynamic Persona Dashboard */}
      {role === "student" && (
        <CourseGrid
          courses={state.courses}
          studentId={studentId}
          onJoinCourse={handleJoinCourse}
          approvedRequests={approvedRequests}
          actionNames={actionNames}
        />
      )}

      {role === "registrar" && (
        <RegistrarDashboard
          courses={state.courses}
          actorName={demoRegistrar.name}
          onUpdateCapacity={handleUpdateCapacity}
          onAttemptOverrides={handleAttemptRegistrarOverrides}
          RequestFormComponent={({ registrar }) => (
            <RequestForm
              courses={state.courses}
              students={state.students}
              panel={state.panel}
              actionNames={actionNames}
              demoRegistrar={demoRegistrar}
              requesterName={demoRegistrar.name}
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
          onDeny={handleDeny}
          onInspectEvidence={(req) => setActiveEvidenceRequest(req)}
          RequestFormComponent={({ registrar }) => (
            <RequestForm
              courses={state.courses}
              students={state.students}
              panel={state.panel}
              actionNames={actionNames}
              demoRegistrar={demoRegistrar}
              requesterName={activeApprover.name}
              onSubmitRequest={handleSubmitRequest}
              registrar={registrar}
            />
          )}
        />
      )}

      {/* Architectural Comparison Section */}
      <ComparisonSection />

      {/* Hash-Chained Public Audit Trail */}
      <AuditLogView
        auditList={state.audit}
        onTamper={() => dispatch({ type: "tamper_audit" })}
        onRestore={() => dispatch({ type: "restore_audit" })}
        isTampered={state.isTampered}
      />

      <footer>
        <span>FairEnrol · RMIT Hackathon 2026 Prototype · Keycloak & TideCloak Integrated</span>
        <span>Standard Authorization Code Flow with PKCE (S256) · W3C Web Crypto AES-GCM-256</span>
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
