import { useState, useEffect } from "react";

export default function RegistrarDashboard({
  courses,
  actorName,
  onUpdateCapacity,
  onAttemptOverrides,
  RequestFormComponent,
}) {
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">REGISTRAR DASHBOARD</div>
          <h2>Restricted Administrative Controls</h2>
        </div>
        <span className="count-pill">Seat limits only · No queue manipulation</span>
      </div>

      <div className="registrar-grid">
        {courses.map((course) => (
          <article className="course-card" key={course.id}>
            <span className="course-code">{course.code}</span>
            <h3>{course.name}</h3>
            <CapacityEditor
              course={course}
              actorName={actorName}
              onSave={onUpdateCapacity}
            />
            <div className="course-stats">
              <span>
                Enrolled <b>{course.enrolled.length}</b>
              </span>
              <span>
                Waitlist <b>{course.waitlist.length}</b>
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="blocked-card">
        <div>
          <span className="blocked-icon">⛔</span>
          <div>
            <strong>Interactive Trust Constraint Demo: Blocked Registrar Overrides</strong>
            <p>
              In conventional university systems, registrars hold unrestricted power to move friends up
              the queue or alter approvals. In FairEnrol, the governance policy strictly blocks this.
            </p>
          </div>
        </div>
        <button className="button outline" onClick={onAttemptOverrides}>
          Attempt Illegal Overrides (Simulate Attack)
        </button>
      </div>

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
      <label htmlFor={`capacity-${course.id}`}>Class limit</label>
      <input
        id={`capacity-${course.id}`}
        type="number"
        min="1"
        max="100"
        value={capacity}
        onChange={(e) => setCapacity(e.target.value)}
      />
      <button className="button quiet" type="submit">
        Save
      </button>
    </form>
  );
}
