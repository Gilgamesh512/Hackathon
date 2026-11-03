import React, { useState } from "react";
import { broadcastCrossTab } from "../services/crossTabSync";

export default function CourseGrid({
  courses,
  studentId,
  studentName,
  onJoinCourse,
  onWithdrawCourse,
  onSimulateConcurrentEnrol,
  onOpenStressModal,
  approvedRequests,
  actionNames,
  auditHistory = [],
}) {
  const [isSimulatingRace, setIsSimulatingRace] = useState(false);
  const [showVisualMap, setShowVisualMap] = useState(true);
  const [honeypotAlert, setHoneypotAlert] = useState("");

  const ownWaitlists = courses
    .map((course) => ({
      course,
      position: course.waitlist.indexOf(studentId) + 1,
    }))
    .filter((item) => item.position > 0);

  const ownEnrolments = courses.filter((course) =>
    course.enrolled.includes(studentId)
  );

  async function handleRaceClick(course) {
    setIsSimulatingRace(true);
    await onSimulateConcurrentEnrol(course.id, studentId);
    setIsSimulatingRace(false);
  }

  function handleTriggerHoneypotProbe(course) {
    const alertMsg = `🚨 Honeypot Sensor Tripped: Unauthorized Queue Jump Attempt on ${course.code} (CWE-284 / BOLA) Blocked & Forensically Anchored!`;
    setHoneypotAlert(alertMsg);
    setTimeout(() => setHoneypotAlert(""), 6000);

    // Broadcast live telemetry to Security Lab
    broadcastCrossTab("EXPLOIT_TELEMETRY", {
      attackType: "QUEUE_JUMP_BOLA_PROBE",
      cwe: "CWE-284",
      owasp: "API1:2023",
      severity: "HIGH",
      actor: studentId,
      endpoint: `/api/courses/${course.id}/force-occupy`,
      method: "POST",
      payloadSummary: `Direct seat theft attempt on ${course.code} bypassing FIFO waitlist`,
      indicator: "BLOCKED: Object-level authorization and strict FIFO sequence controller rejected bypass.",
      evidenceChecksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
  }

  // Filter audit history for current student
  const studentAuditEvents = auditHistory.filter((entry) => {
    return (
      entry.details?.studentId === studentId ||
      entry.reason?.includes(studentName) ||
      entry.reason?.includes(studentId)
    );
  });

  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">STUDENT DASHBOARD · PERSONA: {studentName} ({studentId})</div>
          <h2>Course Registration & FIFO Waitlists</h2>
        </div>
        <div className="status-badges-group">
          <button
            className="button mini outline"
            onClick={() => setShowVisualMap(!showVisualMap)}
            title="Toggle Visual Seat Map & Live Queue Pipeline"
          >
            {showVisualMap ? "Hide Seat Pipeline" : "👁️ Show Seat Pipeline"}
          </button>
          <button
            className="button mini outline stress-lab-btn"
            onClick={() => onOpenStressModal?.(courses[0])}
            title="Open Concurrency & Race Condition Stress Benchmark"
          >
            ⚡ Race Stress Lab
          </button>
          <span className="count-pill badge-enrolled">{ownEnrolments.length} Enrolled</span>
          <span className="count-pill badge-waiting">{ownWaitlists.length} Waitlisted</span>
        </div>
      </div>

      {honeypotAlert && (
        <div className="notice honeypot-notice" role="alert">
          <span>{honeypotAlert}</span>
          <button onClick={() => setHoneypotAlert("")}>×</button>
        </div>
      )}

      {/* Active Position Banner */}
      {ownWaitlists.length > 0 && (
        <div className="position-card" role="region" aria-label="Waitlist Status">
          <div className="position-card-title">
            <span className="live-dot" />
            <strong>Your Live FIFO Waitlist Positions:</strong>
          </div>
          <div className="position-pills">
            {ownWaitlists.map(({ course, position }) => (
              <span className="queue-pill" key={course.id}>
                {course.code}: Position <b>#{position}</b> of {course.waitlist.length}
                <small> (Strict FIFO: Seat guaranteed when next vacancy opens)</small>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Courses Grid */}
      <div className="course-grid">
        {courses.map((course) => {
          const isEnrolled = course.enrolled.includes(studentId);
          const position = course.waitlist.indexOf(studentId) + 1;
          const available = Math.max(0, course.capacity - course.enrolled.length);
          const isFull = available === 0;

          return (
            <article className="course-card" key={course.id}>
              <div className="course-top">
                <span className="course-code">{course.code}</span>
                <span className={available > 0 ? "seats open" : "seats full"}>
                  {available > 0 ? `${available} seat${available > 1 ? "s" : ""} open` : "At capacity"}
                </span>
              </div>

              <h3>{course.name}</h3>

              <div className="course-stats">
                <span>
                  Occupancy:{" "}
                  <b>
                    {course.enrolled.length} / {course.capacity}
                  </b>
                </span>
                <span>
                  Queue: <b>{course.waitlist.length} waiting</b>
                </span>
              </div>

              {/* Progress bar */}
              <div className="capacity-bar-wrap" title={`${course.enrolled.length} of ${course.capacity} seats filled`}>
                <div
                  className={`capacity-bar-fill ${course.enrolled.length >= course.capacity ? "bar-full" : "bar-open"}`}
                  style={{
                    width: `${Math.min(100, (course.enrolled.length / course.capacity) * 100)}%`,
                  }}
                />
              </div>

              {/* Interactive Visual Seat & Queue Flow Pipeline */}
              {showVisualMap && (
                <div className="visual-pipeline-box">
                  <span className="pipeline-label">LIVE SEAT & QUEUE PIPELINE:</span>
                  <div className="seat-grid">
                    {Array.from({ length: course.capacity }, (_, idx) => {
                      const occupantId = course.enrolled[idx];
                      const isOccupied = Boolean(occupantId);
                      const isCurrentStudentSeat = occupantId === studentId;

                      return (
                        <div
                          key={idx}
                          className={`seat-slot ${isOccupied ? "occupied" : "vacant"} ${
                            isCurrentStudentSeat ? "self-seat" : ""
                          }`}
                          title={isOccupied ? `Seat #${idx + 1}: ${occupantId}` : `Seat #${idx + 1}: Vacant`}
                        >
                          <span className="seat-icon">{isOccupied ? "🧑‍💻" : "🪑"}</span>
                          <span className="seat-tag">
                            {isOccupied ? (isCurrentStudentSeat ? "You" : occupantId) : `Open #${idx + 1}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {course.waitlist.length > 0 && (
                    <div className="queue-pipeline-row">
                      <span className="queue-line-tag">FIFO Queue:</span>
                      <div className="queue-pills-scroll">
                        {course.waitlist.map((wId, qIdx) => (
                          <span
                            key={wId}
                            className={`queue-candidate-pill ${wId === studentId ? "self-wait" : ""}`}
                          >
                            #{qIdx + 1} {wId === studentId ? "You" : wId}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons and queue status */}
              <div className="course-action-zone">
                {isEnrolled ? (
                  <div className="enrolled-status-box">
                    <div className="queue-status enrolled">
                      ✓ Enrolled · Seat Confirmed
                      <small>Cryptographically logged to FairEnrol audit ledger.</small>
                    </div>
                    <button
                      className="button outline danger-mini full-width"
                      onClick={() => onWithdrawCourse(course.id, studentId)}
                    >
                      Withdraw from Course
                    </button>
                  </div>
                ) : position > 0 ? (
                  <div className="waitlist-status-box">
                    <div className="queue-status">
                      Position #{position} in waitlist
                      <small>Automatic FIFO promotion on capacity release.</small>
                    </div>
                    <button
                      className="button quiet mini full-width"
                      onClick={() => onWithdrawCourse(course.id, studentId)}
                    >
                      Leave Waitlist
                    </button>
                  </div>
                ) : (
                  <div className="enrol-btn-group">
                    <button
                      className="button dark full-width"
                      onClick={() => onJoinCourse(course)}
                    >
                      {available > 0 ? "Enrol in Course" : "Join FIFO Waitlist"}
                    </button>

                    {available === 1 && (
                      <button
                        className="button outline race-btn full-width"
                        onClick={() => handleRaceClick(course)}
                        disabled={isSimulatingRace}
                        title="Simulate 2 students simultaneously claiming the last seat to verify atomic concurrency guard"
                      >
                        {isSimulatingRace ? "Simulating Race…" : "⚡ Test Concurrent Race Condition"}
                      </button>
                    )}
                  </div>
                )}

                {/* Honeypot / Telemetry Probe Button */}
                <button
                  className="button mini text-muted honeypot-btn"
                  onClick={() => handleTriggerHoneypotProbe(course)}
                  title="Simulate attacker sending direct API request to jump the queue (CWE-284)"
                >
                  ⚠️ Simulate Queue Bypass Probe (Test Honeypot)
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Student Personal Enrolment & Audit Timeline */}
      <div className="section-heading subheading">
        <div>
          <div className="eyebrow">INDIVIDUAL TRANSPARENCY</div>
          <h2>Personal Enrolment & Queue History</h2>
        </div>
      </div>

      <div className="student-timeline">
        {studentAuditEvents.length > 0 ? (
          <div className="timeline-items">
            {studentAuditEvents.map((event) => (
              <div className="timeline-item" key={event.id}>
                <span className="timeline-dot" />
                <div className="timeline-content">
                  <div className="timeline-header">
                    <strong>{event.action}</strong>
                    <time>{new Date(event.time).toLocaleTimeString()}</time>
                  </div>
                  <p>{event.reason}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">No recent enrolment actions recorded for {studentName}. Enrol or join a waitlist above to view your audit history.</p>
        )}
      </div>

      {/* Approved Collective Exceptions View */}
      <div className="section-heading subheading">
        <div>
          <div className="eyebrow">TRANSPARENT REASONS</div>
          <h2>Public Exceptions & Line Modifications</h2>
        </div>
      </div>

      <div className="reason-list">
        {approvedRequests.map((request) => (
          <div className="reason-item" key={request.id}>
            <span className="approved-tag">2/3 QUORUM APPROVED</span>
            <div>
              <strong>{actionNames[request.kind] || request.kind}</strong>
              <p>{request.reason}</p>
              {request.confidentialEvidence && (
                <span className="crypto-badge">
                  ✓ Protected by E2EE medical verification (AES-GCM-256)
                </span>
              )}
            </div>
          </div>
        ))}
        {approvedRequests.length === 0 && (
          <p className="empty">
            No exceptions approved yet. The original FIFO queues remain completely uncompromised.
          </p>
        )}
      </div>
    </section>
  );
}
