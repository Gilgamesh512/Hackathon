export default function CourseGrid({
  courses,
  studentId,
  onJoinCourse,
  approvedRequests,
  actionNames,
}) {
  const ownWaitlists = courses
    .map((course) => ({
      course,
      position: course.waitlist.indexOf(studentId) + 1,
    }))
    .filter((item) => item.position > 0);

  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">STUDENT DASHBOARD</div>
          <h2>Available Courses & Verifiable Queues</h2>
        </div>
        <span className="count-pill">{courses.length} open courses</span>
      </div>

      {ownWaitlists.length > 0 && (
        <div className="position-card">
          <strong>Your active waitlist positions:</strong>
          {ownWaitlists.map(({ course, position }) => (
            <span key={course.id}>
              {course.code} <b>#{position}</b>
            </span>
          ))}
        </div>
      )}

      <div className="course-grid">
        {courses.map((course) => {
          const isEnrolled = course.enrolled.includes(studentId);
          const position = course.waitlist.indexOf(studentId) + 1;
          const available = Math.max(0, course.capacity - course.enrolled.length);

          return (
            <article className="course-card" key={course.id}>
              <div className="course-top">
                <span className="course-code">{course.code}</span>
                <span className={available > 0 ? "seats open" : "seats full"}>
                  {available > 0 ? `${available} seats open` : "At capacity"}
                </span>
              </div>

              <h3>{course.name}</h3>

              <div className="course-stats">
                <span>
                  Enrolled{" "}
                  <b>
                    {course.enrolled.length}/{course.capacity}
                  </b>
                </span>
                <span>
                  Waiting <b>{course.waitlist.length}</b>
                </span>
              </div>

              {position > 0 ? (
                <div className="queue-status">
                  You’re #{position} in the waitlist
                  <small>Strict FIFO order. No registrar can manually move your place.</small>
                </div>
              ) : isEnrolled ? (
                <div className="queue-status enrolled">
                  You’re enrolled <small>Your seat is cryptographically verified.</small>
                </div>
              ) : (
                <button
                  className="button dark full-width"
                  onClick={() => onJoinCourse(course)}
                >
                  {available > 0 ? "Enrol in course" : "Join waitlist"}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="section-heading subheading">
        <div>
          <div className="eyebrow">TRANSPARENT REASONS</div>
          <h2>Public Exceptions & Line Modifications</h2>
        </div>
      </div>

      <div className="reason-list">
        {approvedRequests.map((request) => (
          <div className="reason-item" key={request.id}>
            <span className="approved-tag">2/3 APPROVED</span>
            <div>
              <strong>{actionNames[request.kind] || request.kind}</strong>
              <p>{request.reason}</p>
              {request.confidentialEvidence && (
                <span className="crypto-badge">
                  ✓ Protected by E2EE medical verification
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
