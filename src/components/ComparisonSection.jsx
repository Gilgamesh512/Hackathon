import React from "react";

export default function ComparisonSection() {
  return (
    <section className="section explainer">
      <div className="section-heading">
        <div>
          <div className="eyebrow">THE ARCHITECTURAL SHIFT</div>
          <h2>Centralized IAM vs. TideCloak Collective Governance</h2>
        </div>
      </div>

      <div className="compare-grid">
        <article className="compare-card ordinary">
          <span>TRADITIONAL CENTRALIZED DATABASE & ROLE</span>
          <h3>Single Point of Power (Vulnerable)</h3>
          <ul>
            <li>
              <strong>Unchecked Registrar Privilege:</strong> A database administrator or registrar can
              secretly reorder students with a single direct SQL query or private API call.
            </li>
            <li>
              <strong>Cronyism & Backdoors:</strong> "Force enrol" actions happen behind closed doors without
              verifiable justification or public auditability.
            </li>
            <li>
              <strong>Internal Compromise:</strong> Leaked registrar credentials grant unlimited power to hijack
              enrollment seats and tamper with past logs.
            </li>
          </ul>
          <p>
            Trust relies entirely on the personal integrity of individual administrators. When trust breaks,
            students suffer silently.
          </p>
        </article>

        <article className="compare-card tide">
          <span>TIDECLOAK DECENTRALIZED IDENTITY & QUORUM</span>
          <h3>Cryptographically Enforced Fairness</h3>
          <ul>
            <li>
              <strong>Verifiable FIFO Queue:</strong> Queue order is strictly first-come, first-served. Mathematical
              hash chains prevent retroactively altering queue sequences.
            </li>
            <li>
              <strong>Multi-Party 2-of-3 Authorization:</strong> No single entity can bypass the queue alone.
              Exceptions require quorum from independent academic, student, and advisory panel members.
            </li>
            <li>
              <strong>E2EE Confidential Evidence:</strong> Sensitive disability and medical accommodation documents
              are cryptographically locked; only authorized quorums hold the decryption capability.
            </li>
          </ul>
          <p>
            TideCloak authenticates identity without creating single-point vulnerabilities. Fairness is guaranteed
            by math and consensus, not blind trust.
          </p>
        </article>
      </div>
    </section>
  );
}
