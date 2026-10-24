import React, { useState } from "react";
import { SEVERITY } from "../services/fairnessMonitor";

export default function FairnessMonitorView({
  alerts = [],
  courses = [],
  auditCount = 0,
  onResolveStalledQueue,
}) {
  const [filterSeverity, setFilterSeverity] = useState("ALL");

  const criticalCount = alerts.filter((a) => a.severity === SEVERITY.CRITICAL).length;
  const warningCount = alerts.filter((a) => a.severity === SEVERITY.WARNING).length;
  const infoCount = alerts.filter((a) => a.severity === SEVERITY.INFO).length;

  const filteredAlerts = alerts.filter((alert) => {
    if (filterSeverity === "ALL") return true;
    return alert.severity === filterSeverity;
  });

  const fairnessScore = Math.max(
    0,
    100 - criticalCount * 40 - warningCount * 15
  );

  return (
    <section className="section fairness-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">TRANSPARENCY & ACCOUNTABILITY ENGINE</div>
          <h2>Explainable Fairness Monitor</h2>
        </div>
        <div className="fairness-header-pills">
          <span className={`fairness-score-pill ${fairnessScore >= 80 ? "score-good" : fairnessScore >= 50 ? "score-warn" : "score-bad"}`}>
            Fairness Index: <strong>{fairnessScore}%</strong>
          </span>
          <span className="count-pill">{alerts.length} Rules Evaluated</span>
        </div>
      </div>

      <p className="section-desc">
        Continuous, automated rule-based analysis comparing course capacities, waitlist sequences,
        2-of-3 quorum exceptions, and cryptographic ledger events. Detects subtle favouritism,
        queue bypass attempts, and administrative timing anomalies.
      </p>

      {/* Metric Cards Grid */}
      <div className="fairness-metrics-grid">
        <div className="f-metric-card">
          <span className="f-metric-label">Ledger Chain Status</span>
          <strong className={`f-metric-val ${criticalCount > 0 ? "metric-red" : "metric-green"}`}>
            {criticalCount > 0 ? "TAMPERED" : "VERIFIED"}
          </strong>
          <small>{auditCount} SHA-256 blocks anchored</small>
        </div>

        <div className="f-metric-card">
          <span className="f-metric-label">Queue Integrity</span>
          <strong className="f-metric-val metric-blue">STRICT FIFO</strong>
          <small>Automated promotions enforced</small>
        </div>

        <div className="f-metric-card">
          <span className="f-metric-label">Collective Exceptions</span>
          <strong className="f-metric-val metric-purple">{infoCount} Verified</strong>
          <small>Multi-party 2-of-3 quorum</small>
        </div>

        <div className="f-metric-card">
          <span className="f-metric-label">Anomaly Flags</span>
          <strong className={`f-metric-val ${warningCount > 0 ? "metric-amber" : "metric-green"}`}>
            {warningCount} Patterns
          </strong>
          <small>Subject to manual review</small>
        </div>
      </div>

      {/* Course Queue Health Table */}
      <div className="queue-health-box">
        <div className="queue-health-head">
          <h3>Course Capacity & Queue Health Matrix</h3>
          {courses.some((c) => c.capacity > c.enrolled.length && c.waitlist.length > 0) && (
            <button
              className="button mini outline"
              onClick={onResolveStalledQueue}
              title="Promote first waitlist student into open seats"
            >
              ⚡ Auto-Promote Waitlists
            </button>
          )}
        </div>
        <div className="table-responsive">
          <table className="fairness-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Enrolled / Capacity</th>
                <th>Available Seats</th>
                <th>Waitlist Depth</th>
                <th>Next in Line (FIFO)</th>
                <th>Queue State</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => {
                const openSeats = Math.max(0, c.capacity - c.enrolled.length);
                const hasStalledPromotion = openSeats > 0 && c.waitlist.length > 0;
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.code}</strong>
                      <div className="small-muted">{c.name}</div>
                    </td>
                    <td>
                      {c.enrolled.length} / {c.capacity}
                    </td>
                    <td>
                      <span className={openSeats > 0 ? "badge-green" : "badge-gray"}>
                        {openSeats} seats
                      </span>
                    </td>
                    <td>{c.waitlist.length} waiting</td>
                    <td>
                      {c.waitlist.length > 0 ? (
                        <code>{c.waitlist[0]}</code>
                      ) : (
                        <span className="muted-text">—</span>
                      )}
                    </td>
                    <td>
                      {hasStalledPromotion ? (
                        <span className="badge-amber">Promotion Pending</span>
                      ) : openSeats === 0 && c.waitlist.length > 0 ? (
                        <span className="badge-blue">Full (Queue Active)</span>
                      ) : (
                        <span className="badge-green">Balanced</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="alert-filter-bar">
        <span>Filter Findings:</span>
        <button
          className={`filter-btn ${filterSeverity === "ALL" ? "active" : ""}`}
          onClick={() => setFilterSeverity("ALL")}
        >
          All ({alerts.length})
        </button>
        <button
          className={`filter-btn ${filterSeverity === SEVERITY.CRITICAL ? "active" : ""}`}
          onClick={() => setFilterSeverity(SEVERITY.CRITICAL)}
        >
          Critical Violations ({criticalCount})
        </button>
        <button
          className={`filter-btn ${filterSeverity === SEVERITY.WARNING ? "active" : ""}`}
          onClick={() => setFilterSeverity(SEVERITY.WARNING)}
        >
          Suspicious Patterns ({warningCount})
        </button>
        <button
          className={`filter-btn ${filterSeverity === SEVERITY.INFO ? "active" : ""}`}
          onClick={() => setFilterSeverity(SEVERITY.INFO)}
        >
          Verified Quorums ({infoCount})
        </button>
      </div>

      {/* Alerts Feed */}
      <div className="alerts-feed">
        {filteredAlerts.map((alert) => (
          <article
            key={alert.id}
            className={`alert-card alert-${alert.severity.toLowerCase()}`}
          >
            <div className="alert-card-header">
              <div className="alert-title-wrap">
                <span className={`severity-tag ${alert.severity.toLowerCase()}`}>
                  {alert.severity}
                </span>
                <strong>{alert.title}</strong>
              </div>
              <code className="rule-badge">{alert.rule}</code>
            </div>

            <p className="alert-explanation">{alert.explanation}</p>

            <div className="alert-evidence-box">
              <div className="evidence-header">UNDERLYING AUDIT EVIDENCE:</div>
              <pre className="evidence-code">
                {JSON.stringify(alert.evidence, null, 2)}
              </pre>
            </div>

            <div className="alert-recommendation">
              <strong>Recommendation:</strong> {alert.recommendedAction}
            </div>
          </article>
        ))}

        {filteredAlerts.length === 0 && (
          <div className="empty-alerts">
            <span className="checkmark-icon">✓</span>
            <p>No fairness findings matching the selected filter criteria.</p>
          </div>
        )}
      </div>
    </section>
  );
}
