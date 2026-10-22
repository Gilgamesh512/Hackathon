import { useState } from "react";
import { encryptConfidentialEvidence } from "../services/crypto";
import { APPROVER_SECRET_KEY } from "../services/tidecloak";

export default function RequestForm({
  courses,
  students,
  panel,
  actionNames,
  demoRegistrar,
  requesterName,
  onSubmitRequest,
  registrar = false,
}) {
  const [requestKind, setRequestKind] = useState("force");
  const [selectedCourse, setSelectedCourse] = useState(courses[0]?.id || "");
  const [targetStudent, setTargetStudent] = useState(students[3]?.id || "");
  const [reason, setReason] = useState(
    "Accessibility accommodation: student requires specialized lab equipment accessible only in this physical section."
  );
  const [confidentialEvidence, setConfidentialEvidence] = useState(
    "CONFIDENTIAL MEDICAL CERTIFICATE #MED-2026-9041: Verified by RMIT Student Wellbeing Center. Chronic physical mobility condition requires ground-floor computer laboratory access."
  );
  const [includeEncryptedEvidence, setIncludeEncryptedEvidence] = useState(true);
  const [panelCandidate, setPanelCandidate] = useState(demoRegistrar.id);
  const [panelRemoval, setPanelRemoval] = useState(panel[2]?.id || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const candidates = [
    ...students
      .filter((s) => !panel.some((m) => m.id === s.id))
      .slice(0, 5)
      .map((s) => ({ ...s, title: "Student Representative" })),
    demoRegistrar,
  ];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) return;

    setIsSubmitting(true);

    let encryptedPayload = null;
    if (includeEncryptedEvidence && confidentialEvidence.trim()) {
      encryptedPayload = await encryptConfidentialEvidence(
        confidentialEvidence.trim(),
        APPROVER_SECRET_KEY
      );
    }

    const base = {
      kind: requestKind,
      requester: requesterName,
      reason: reason.trim(),
      confidentialEvidence: encryptedPayload,
    };

    if (requestKind === "panel") {
      const candidate =
        panelCandidate === demoRegistrar.id
          ? { id: demoRegistrar.id, name: demoRegistrar.name, title: demoRegistrar.title }
          : students.find((s) => s.id === panelCandidate);
      const replaceMember = panel.find((m) => m.id === panelRemoval);

      if (!candidate || !replaceMember) {
        setIsSubmitting(false);
        return;
      }

      onSubmitRequest({ ...base, candidate, replaceMember });
    } else {
      onSubmitRequest({
        ...base,
        courseId: selectedCourse,
        studentId: targetStudent,
      });
    }

    setIsSubmitting(false);
  }

  return (
    <form className="request-form" onSubmit={handleSubmit}>
      <div className="form-title">
        <div>
          <div className="eyebrow">
            {registrar ? "ADMINISTRATIVE EXCEPTION REQUEST" : "NEW PROTECTED REQUEST"}
          </div>
          <h3>Submit Exception for Panel Quorum Review</h3>
        </div>
        <span className="approval-badge">2-of-3 Panel Approvals Required</span>
      </div>

      <div className="form-grid">
        <label>
          Requested Action
          <select
            value={requestKind}
            onChange={(e) => setRequestKind(e.target.value)}
          >
            {Object.entries(actionNames).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {requestKind !== "panel" ? (
          <>
            <label>
              Course
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} · {course.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Beneficiary Student
              <select
                value={targetStudent}
                onChange={(e) => setTargetStudent(e.target.value)}
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} ({student.id})
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              Replace Panel Member
              <select
                value={panelRemoval}
                onChange={(e) => setPanelRemoval(e.target.value)}
              >
                {panel.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.title})
                  </option>
                ))}
              </select>
            </label>

            <label>
              With New Candidate
              <select
                value={panelCandidate}
                onChange={(e) => setPanelCandidate(e.target.value)}
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.title})
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="reason-field">
          Public Justification (Recorded permanently on public ledger)
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={240}
            placeholder="Explain why this exception is justified; this reason is visible to all students."
          />
        </label>

        <div className="evidence-field-container">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeEncryptedEvidence}
              onChange={(e) => setIncludeEncryptedEvidence(e.target.checked)}
            />
            Attach Confidential E2EE Supporting Evidence (Medical / Wellbeing / Disability Record)
          </label>

          {includeEncryptedEvidence && (
            <textarea
              className="evidence-textarea"
              value={confidentialEvidence}
              onChange={(e) => setConfidentialEvidence(e.target.value)}
              placeholder="Private details that only the 2-of-3 Approver Panel can cryptographically decrypt."
              rows={3}
            />
          )}
        </div>
      </div>

      <div className="form-footer">
        <span>
          Governance Rule: Requesters cannot vote on their own submissions. Zero unilateral bypass.
        </span>
        <button className="button dark" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Encrypting & Submitting…" : "Submit Exception for Quorum"}
        </button>
      </div>
    </form>
  );
}
