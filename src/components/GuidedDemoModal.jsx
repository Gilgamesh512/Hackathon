import { useState } from "react";

export default function GuidedDemoModal({
  isOpen,
  onClose,
  onSwitchPersona,
  onSwitchTab,
  onSimulateWithdrawal,
  onSimulateIllegalOverride,
  onNavigateToEvidence,
}) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      stepNumber: 1,
      title: "Step 1: Baseline FIFO Waitlist & Automatic Dispatch",
      persona: "Student (Riley Nguyen · Waitlist #1)",
      description:
        "In traditional portals, when a seat opens, registrars manually pick who gets in. In FairEnrol, the FIFO queue is mathematically enforced. When Avery Chen withdraws from COMP3100, the Automated Dispatcher immediately promotes Riley into the confirmed seat.",
      actionLabel: "▶ Switch to Avery & Withdraw Seat",
      action: () => {
        onSwitchTab("dashboard");
        onSwitchPersona("student");
        onSimulateWithdrawal?.();
      },
    },
    {
      stepNumber: 2,
      title: "Step 2: The Attack — Registrar Unilateral Override Blocked",
      persona: "Registrar (Admin & Quotas)",
      description:
        "The university registrar attempts to unilaterally force a friend into a full course or alter the approval panel. FairEnrol rejects single-actor overrides at the protocol level. The attempted breach is permanently immutably logged to the public ledger.",
      actionLabel: "▶ Switch to Registrar & Attempt Overrides",
      action: () => {
        onSwitchTab("dashboard");
        onSwitchPersona("registrar");
        onSimulateIllegalOverride?.();
      },
    },
    {
      stepNumber: 3,
      title: "Step 3: Legitimate Exemption & E2EE Privacy (2-of-3 Quorum)",
      persona: "Approver (Dr. Amara Okafor · Head of School)",
      description:
        "When a student legitimately needs an exemption (e.g. accessibility accommodation), the medical certificate is encrypted with W3C Web Crypto AES-GCM-256 + AAD. Public viewers only see the reason, while the 2-of-3 panel decrypts and votes to reach consensus.",
      actionLabel: "▶ Switch to Approver Panel",
      action: () => {
        onSwitchTab("dashboard");
        onSwitchPersona("approver");
        onNavigateToEvidence?.();
      },
    },
    {
      stepNumber: 4,
      title: "Step 4: Tampering Detection via Checkpoint Anchor",
      persona: "System Auditor & Community Watch",
      description:
        "If a rogue database admin hacks the server and rewrites every historical block's hash, FairEnrol's Independent Checkpoint Anchor and Explainable Fairness Monitor immediately detect the chain divergence and flash critical alerts.",
      actionLabel: "▶ Open Explainable Fairness Monitor",
      action: () => {
        onSwitchTab("fairness_monitor");
      },
    },
    {
      stepNumber: 5,
      title: "Step 5: Security Lab, Telemetry & SARIF Reporting",
      persona: "Security Engineer & Pentester",
      description:
        "FairEnrol incorporates an isolated Security Lab Control Plane that monitors target health, catches live exploit telemetry (BOLA, Mass Assignment, Canary tokens), and exports standardized OASIS SARIF v2.1.0 security reports.",
      actionLabel: "▶ Open Security Lab & Attack Sandbox",
      action: () => {
        onSwitchTab("security_lab");
      },
    },
  ];

  const active = steps[currentStep];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet guided-tour-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tour-modal-header">
          <div>
            <div className="tour-step-badge">
              STEP {active.stepNumber} OF {steps.length} · 3-MINUTE STORY TOUR
            </div>
            <h2>{active.title}</h2>
          </div>
          <button className="button-close" onClick={onClose} title="Close Tour">
            ✕
          </button>
        </div>

        {/* Progress bar */}
        <div className="tour-progress-track">
          <div
            className="tour-progress-fill"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="tour-body-content">
          <div className="tour-persona-callout">
            <span className="persona-icon">👤</span>
            <span>
              Active Perspective: <strong>{active.persona}</strong>
            </span>
          </div>

          <p className="tour-description-text">{active.description}</p>
        </div>

        <div className="tour-actions-footer">
          <div className="tour-left-buttons">
            <button
              className="button outline"
              onClick={() => setCurrentStep((p) => Math.max(0, p - 1))}
              disabled={currentStep === 0}
            >
              ← Previous
            </button>
            <button
              className="button outline"
              onClick={() => setCurrentStep((p) => Math.min(steps.length - 1, p + 1))}
              disabled={currentStep === steps.length - 1}
            >
              Next →
            </button>
          </div>

          <div className="tour-right-buttons">
            <button
              className="button primary"
              onClick={() => {
                active.action();
              }}
            >
              {active.actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
