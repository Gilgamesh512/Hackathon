import React from "react";

export default function Header({
  authenticated,
  tokenName,
  userProfile,
  isLoggingIn,
  isLiveSequencer,
  onLogin,
  onLogout,
  onOpenSetup,
  onOpenTour,
  onExportCertificate,
  onOpenVerifier,
  onOpenStress,
  quarantineState,
  onDismissQuarantine,
}) {
  return (
    <>
      {quarantineState?.isQuarantined && (
        <div className="active-defense-quarantine-banner" role="alert">
          <div className="quarantine-content">
            <span className="quarantine-badge">🚨 TIDECLOAK ACTIVE DEFENSE INTERVENTION</span>
            <span className="quarantine-msg">
              <strong>Session Revoked:</strong> Credentials for <em>{quarantineState.actor}</em> isolated.
              <strong> Threat:</strong> {quarantineState.reason}.
              {quarantineState.evidenceChecksum && (
                <span className="evidence-pill"> SHA-256: {quarantineState.evidenceChecksum.slice(0, 16)}…</span>
              )}
            </span>
          </div>
          <button className="button small primary" onClick={onDismissQuarantine}>
            Acknowledge & Re-authenticate
          </button>
        </div>
      )}
      <header className="topbar">
      <a className="brand" href="#">
        <span className="brand-mark">F</span>
        <span>
          FairEnrol <span className="brand-badge">RMIT 2026</span>
        </span>
      </a>

      <div className="top-actions">
        <button
          className="button outline story-tour-btn"
          onClick={onOpenTour}
          title="Start 3-Minute Story Demo Walkthrough"
        >
          <span>✨ 3-Min Demo Tour</span>
        </button>

        <button
          className="button outline export-cert-btn"
          onClick={onExportCertificate}
          title="Export Cryptographically Anchored Audit Certificate (JSON)"
        >
          <span>📜 Export Proof</span>
        </button>

        <button
          className="button outline verify-proof-btn"
          onClick={onOpenVerifier}
          title="Upload & Verify Independent JSON Audit Certificate (Zero-Trust)"
        >
          <span>🔍 Verify Proof</span>
        </button>

        <button
          className="button outline stress-btn"
          onClick={onOpenStress}
          title="Run Massive Concurrent Race Condition Stress Benchmark (CWE-362)"
        >
          <span>⚡ Stress Lab</span>
        </button>

        <button
          className="button outline setup-guide-btn"
          onClick={onOpenSetup}
          title="TideCloak Setup Guide"
        >
          <span className="icon-gear">⚙</span> TideCloak
        </button>

        <span
          className={`auth-state ${isLiveSequencer ? "connected" : "disconnected"}`}
          title={
            isLiveSequencer
              ? "Verifiable Server Sequencer Active on Port 4000 (Atomic Mutex & SSE Synchronizer)"
              : "Running in Resilient Local Mode (Start 'npm run server' for live multi-computer sync)"
          }
        >
          <i />
          <span className="auth-label">
            {isLiveSequencer ? "🟢 Sequencer (4000)" : "Local Mode"}
          </span>
        </span>

        <span
          className={`auth-state ${authenticated ? "connected" : "disconnected"}`}
          title={
            authenticated
              ? "Connected to TideCloak session"
              : "Not logged into TideCloak"
          }
        >
          <i />
          <span className="auth-label">
            {authenticated ? (
              <>
                <strong>{tokenName || "Tide User"}</strong>
                {userProfile?.roles?.length > 0 && (
                  <span className="role-tag">
                    {userProfile.roles.includes("registrar")
                      ? "Registrar"
                      : userProfile.roles.includes("approver")
                      ? "Approver"
                      : "Student"}
                  </span>
                )}
              </>
            ) : (
              "TideCloak · Offline"
            )}
          </span>
        </span>

        {authenticated ? (
          <button className="button quiet" onClick={onLogout}>
            Log out
          </button>
        ) : (
          <button
            className="button dark"
            onClick={onLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? "Logging in…" : "Log in with TideCloak"}
          </button>
        )}
      </div>
    </header>
  </>
  );
}
