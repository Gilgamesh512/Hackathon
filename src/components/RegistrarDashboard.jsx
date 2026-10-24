import React, { useState, useEffect } from "react";

export default function RegistrarDashboard({
  courses,
  actorName,
  onUpdateCapacity,
  onAttemptOverrides,
  onTriggerPromotions,
  RequestFormComponent,
}) {
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">REGISTRAR DASHBOARD · PERSONA: {actorName}</div>
          <h2>Restricted Administrative Controls & Proposals</h2>
        </div>
        <div className="header-actions">
          <button
            className="button outline mini"
            onClick={onTriggerPromotions}
            title="Perform a deterministic FIFO promotion sweep for any courses with newly available seats"
          >
            ⚡ Run FIFO Promotion Sweep
          </button>
          <span className="count-pill">Seat Limits Only · Zero Queue Privilege</span>
        </div>
      </div>

      <p className="section-desc">
        Under FairEnrol's zero-trust model, registrars can adjust room capacity quotas or sponsor
        formal exception requests. They possess <strong>no database privileges</strong> to manually
        reorder waitlists, sneak favored students into closed classes, or bypass the 2-of-3 quorum.
      </p>

      {/* Courses and Capacities Grid */}
      <div className="registrar-grid">
        {courses.map((course) => {
          const available = Math.max(0, course.capacity - course.enrolled.length);
          return (
            <article className="course-card registrar-card" key={course.id}>
              <div className="course-top">
                <span className="course-code">{course.code}</span>
                <span className={available > 0 ? "seats open" : "seats full"}>
                  {available > 0 ? `${available} available` : "Full"}
                </span>
              </div>

              <h3>{course.name}</h3>

              <CapacityEditor
                course={course}
                actorName={actorName}
                onSave={onUpdateCapacity}
              />

              <div className="course-stats">
                <span>
                  Enrolled: <b>{course.enrolled.length}</b>
                </span>
                <span>
                  Waitlist: <b>{course.waitlist.length}</b>
                </span>
              </div>

              {/* Waitlist details */}
              <div className="registrar-waitlist-box">
                <span className="waitlist-label">FIFO Waitlist Order:</span>
                {course.waitlist.length > 0 ? (
                  <ol className="waitlist-mini-list">
                    {course.waitlist.map((sId, idx) => (
                      <li key={sId}>
                        <code>{sId}</code> {idx === 0 ? " (Next to promote)" : ""}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <span className="empty-text">No students currently waiting.</span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Blocked Attacks Simulator */}
      <div className="blocked-card" role="region" aria-label="Security Constraint Demonstration">
        <div className="blocked-content">
          <span className="blocked-icon">⛔</span>
          <div>
            <strong>Interactive Security Guarantee: Blocked Registrar Overrides</strong>
            <p>
              In conventional enterprise registration systems, administrative accounts have direct
              write access to student queues. In FairEnrol, attempts by a registrar to unilaterally
              force-enrol a friend or alter the independent panel are rejected and recorded permanently
              in the tamper-evident audit ledger.
            </p>
          </div>
        </div>
        <button className="button outline danger-btn" onClick={onAttemptOverrides}>
          Attempt Illegal Overrides (Simulate Attack)
        </button>
      </div>

      {/* Proposal Request Form */}
      <RequestFormComponent registrar={true} />
    </section>
  );
}

function CapacityEditor({ course, actorName, onSave }) {
  const [capacity, setCapacity] = useState(String(course.capacity));

  useEffect(() => {
    setCapacity(String(course.capacity));
  }, [course.capacity]);

  function handleSubmit(e) {
    e.preventDefault();
    onSave(course.id, capacity, actorName);
  }

  return (
    <form className="capacity-label" onSubmit={handleSubmit}>
      <label htmlFor={`capacity-${course.id}`}>Seat Quota Limit:</label>
      <div className="capacity-input-wrap">
        <input
          id={`capacity-${course.id}`}
          type="number"
          min="1"
          max="200"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        <button className="button quiet mini" type="submit">
          Update Quota
        </button>
      </div>
    </form>
  );
}
