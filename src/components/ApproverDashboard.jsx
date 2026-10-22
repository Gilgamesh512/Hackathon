import React from "react";

export default function ApproverDashboard({
  panel,
  activeApprover,
  requests,
  courses,
  students,
  actionNames,
  onVote,
  onDeny,
  onInspectEvidence,
  RequestFormComponent,
}) {
  function getPersonName(id) {
    return students.find((s) => s.id === id)?.name ?? id;
  }

  function getCourseCode(id) {
    return courses.find((c) => c.id === id)?.code ?? id;
  }

  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">COLLECTIVE GOVERNANCE</div>
          <h2>Independent Approver Panel</h2>
        </div>
        <span className="count-pill">
          {panel.length} Independent Members · 2-of-3 Quorum Required
        </span>
      </div>

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
            <span>
              <strong>{member.name}</strong>
              <small>{member.title}</small>
            </span>
          </div>
        ))}
      </div>

      <RequestFormComponent registrar={false} />

      <div className="section-heading subheading">
        <div>
          <div className="eyebrow">EXCEPTIONS PENDING COLLECTIVE CONSENSUS</div>
          <h2>Pending Review Requests</h2>
        </div>
      </div>

      <div className="request-list">
        {requests.map((request) => {
          const isPending = request.status === "pending";
          const hasVoted = request.approvals.some((m) => m.id === activeApprover?.id);
          const isRequester = request.requester === activeApprover?.name;

          return (
            <article className="request-card" key={request.id}>
              <div className="request-head">
                <div>
                  <span className="eyebrow">{actionNames[request.kind] || request.kind}</span>
                  <h3>
                    {request.kind === "panel"
                      ? `Replace ${request.replaceMember?.name} with ${request.candidate?.name}`
                      : `${request.kind === "force" ? "Enrol" : request.kind === "jump" ? "Move Up" : "Remove"} ${getPersonName(
                          request.studentId
                        )} · ${getCourseCode(request.courseId)}`}
                  </h3>
                </div>
                <span className={`status-tag ${request.status}`}>{request.status}</span>
              </div>

              <p className="request-reason">“{request.reason}”</p>

              {request.confidentialEvidence && (
                <div className="evidence-badge-row">
                  <span className="crypto-evidence-indicator">
                    🔒 E2EE Confidential Medical / Accommodation Certificate attached
                  </span>
                  <button
                    className="button quiet inspect-evidence-btn"
                    onClick={() => onInspectEvidence(request)}
                  >
                    Inspect Encrypted Evidence
                  </button>
                </div>
              )}

              <div className="vote-row">
                <span>
                  <strong>{request.approvals.length} of 2</strong> required approvals
                </span>
                <div className="vote-avatars">
                  {request.approvals.map((member) => (
                    <span
                      className="avatar mini"
                      title={`Approved by ${member.name} (${member.title})`}
                      key={member.id}
                    >
                      {member.name
                        .split(" ")
                        .map((p) => p[0])
                        .slice(-2)
                        .join("")}
                    </span>
                  ))}
                </div>
              </div>

              {isPending && (
                <div className="request-actions">
                  {isRequester ? (
                    <span className="muted">
                      Conflict of Interest: Requester cannot approve their own exception.
                    </span>
                  ) : (
                    <button
                      className="button approve"
                      onClick={() => onVote(request.id, activeApprover)}
                      disabled={hasVoted}
                    >
                      {hasVoted
                        ? `Approved by ${activeApprover?.name}`
                        : `Approve as ${activeApprover?.name}`}
                    </button>
                  )}
                  <button
                    className="button text-button"
                    onClick={() => onDeny(request.id, activeApprover?.name)}
                  >
                    Deny Request
                  </button>
                </div>
              )}
            </article>
          );
        })}

        {requests.length === 0 && (
          <p className="empty">No exception requests submitted yet. Use the form above to create one.</p>
        )}
      </div>
    </section>
  );
}
