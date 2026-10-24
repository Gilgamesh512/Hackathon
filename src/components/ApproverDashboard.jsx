import React from "react";

export default function ApproverDashboard({
  panel,
  activeApprover,
  requests,
  courses,
  students,
  actionNames,
  onVote,
  onRejectVote,
  onInspectEvidence,
  RequestFormComponent,
}) {
  function getPersonName(id) {
    return students.find((s) => s.id === id)?.name ?? id;
  }

  function getCourseCode(id) {
    return courses.find((c) => c.id === id)?.code ?? id;
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const finalizedRequests = requests.filter((r) => r.status !== "pending");

  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">COLLECTIVE MULTI-PARTY GOVERNANCE</div>
          <h2>Independent Approver Panel (2-of-3 Quorum)</h2>
        </div>
        <span className="count-pill">
          {panel.length} Authorized Approvers · 2 Consenting Signatures Required
        </span>
      </div>

      <p className="section-desc">
        Special consideration exceptions require at least 2 independent concurring approvals. No
        single registrar, faculty dean, or student representative can grant an exception unilaterally.
        All votes and timestamps are recorded in the SHA-256 hash-chained audit ledger.
      </p>

      {/* Panel Members Strip */}
      <div className="panel-strip">
        {panel.map((member) => (
          <div
            className={`panel-person ${activeApprover?.id === member.id ? "active-panel-person" : ""}`}
            key={member.id}
          >
            <span className="avatar">
              {member.name
                .split(" ")
                .map((p) => p[0])
                .slice(-2)
                .join("")}
            </span>
            <div className="panel-person-info">
              <strong>{member.name}</strong>
              <small>{member.title}</small>
              {activeApprover?.id === member.id && (
                <span className="current-badge">Active Persona</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Propose an Exception */}
      <RequestFormComponent registrar={false} />

      {/* Pending Exception Proposals */}
      <div className="section-heading subheading">
        <div>
          <div className="eyebrow">EXCEPTIONS PENDING COLLECTIVE CONSENSUS</div>
          <h2>Active Proposals Awaiting Vote ({pendingRequests.length})</h2>
        </div>
      </div>

      <div className="request-list">
        {pendingRequests.map((request) => {
          const approvals = request.approvals || [];
          const rejections = request.rejections || [];
          const hasVotedApprove = approvals.some((m) => m.id === activeApprover?.id);
          const hasVotedReject = rejections.some((m) => m.id === activeApprover?.id);
          const hasVoted = hasVotedApprove || hasVotedReject;
          const isRequester =
            request.requesterId === activeApprover?.id ||
            request.requester === activeApprover?.name;

          return (
            <article className="request-card" key={request.id}>
              <div className="request-head">
                <div>
                  <span className="eyebrow">{actionNames[request.kind] || request.kind}</span>
                  <h3>
                    {request.kind === "panel"
                      ? `Replace ${request.replaceMember?.name} with ${request.candidate?.name}`
                      : `${request.kind === "force" ? "Force Enrol" : request.kind === "jump" ? "Priority Waitlist Insertion" : "Withdrawal"}: ${getPersonName(
                          request.studentId
                        )} · ${getCourseCode(request.courseId)}`}
                  </h3>
                  <div className="request-meta">
                    Submitted by <strong>{request.requester}</strong> ·{" "}
                    <time>{new Date(request.createdAt || Date.now()).toLocaleTimeString()}</time>
                  </div>
                </div>
                <span className={`status-tag ${request.status}`}>{request.status.toUpperCase()}</span>
              </div>

              <div className="request-reason-box">
                <span className="reason-label">Public Justification:</span>
                <p className="request-reason">“{request.reason}”</p>
              </div>

              {request.confidentialEvidence && (
                <div className="evidence-badge-row">
                  <span className="crypto-evidence-indicator">
                    🔒 AES-GCM-256 Confidential Medical / Wellbeing Documentation Attached
                  </span>
                  <button
                    className="button quiet inspect-evidence-btn"
                    onClick={() => onInspectEvidence(request)}
                  >
                    Inspect E2EE Evidence
                  </button>
                </div>
              )}

              {/* Quorum Progress Bar */}
              <div className="quorum-meter-wrap">
                <div className="quorum-status-row">
                  <span>
                    <strong>{approvals.length} of 2</strong> approvals needed for quorum
                  </span>
                  {rejections.length > 0 && (
                    <span className="reject-count-tag">
                      {rejections.length} of 2 rejections
                    </span>
                  )}
                </div>
                <div className="quorum-track">
                  <div
                    className="quorum-fill"
                    style={{ width: `${Math.min(100, (approvals.length / 2) * 100)}%` }}
                  />
                </div>
                <div className="vote-avatars">
                  {approvals.map((member) => (
                    <span
                      className="avatar mini approve-avatar"
                      title={`Approved by ${member.name} (${member.title})`}
                      key={member.id}
                    >
                      ✓ {member.name.split(" ").map((p) => p[0]).slice(-2).join("")}
                    </span>
                  ))}
                  {rejections.map((member) => (
                    <span
                      className="avatar mini reject-avatar"
                      title={`Rejected by ${member.name} (${member.title})`}
                      key={member.id}
                    >
                      ✗ {member.name.split(" ").map((p) => p[0]).slice(-2).join("")}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="request-actions">
                {isRequester ? (
                  <span className="muted warning-pill">
                    ⛔ Conflict of Interest Guard: Requesters cannot vote on their own proposal.
                  </span>
                ) : hasVoted ? (
                  <span className="voted-indicator">
                    ✓ You have recorded your vote ({hasVotedApprove ? "Approval" : "Rejection"}) as {activeApprover?.name}.
                  </span>
                ) : (
                  <div className="vote-action-buttons">
                    <button
                      className="button approve"
                      onClick={() => onVote(request.id, activeApprover)}
                    >
                      ✓ Approve as {activeApprover?.name}
                    </button>
                    <button
                      className="button outline danger-mini"
                      onClick={() => onRejectVote(request.id, activeApprover)}
                    >
                      ✗ Cast Rejection Vote
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}

        {pendingRequests.length === 0 && (
          <p className="empty">No pending exception requests requiring panel review. All submitted proposals have reached quorum or been finalized.</p>
        )}
      </div>

      {/* Historical Finalized Proposals */}
      {finalizedRequests.length > 0 && (
        <>
          <div className="section-heading subheading">
            <div>
              <div className="eyebrow">AUDITABLE ARCHIVE</div>
              <h2>Resolved Proposals & Decisions ({finalizedRequests.length})</h2>
            </div>
          </div>

          <div className="request-list history-list">
            {finalizedRequests.map((req) => (
              <article className="request-card archived-card" key={req.id}>
                <div className="request-head">
                  <div>
                    <strong>{actionNames[req.kind] || req.kind}</strong>: {getPersonName(req.studentId)}
                    <div className="small-muted">{req.reason}</div>
                  </div>
                  <span className={`status-tag ${req.status}`}>{req.status.toUpperCase()}</span>
                </div>
                <div className="small-muted">
                  Approvers: {req.approvals?.map((a) => a.name).join(", ") || "None"}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
