import React from "react";

export default function Header({
  authenticated,
  tokenName,
  userProfile,
  isLoggingIn,
  onLogin,
  onLogout,
  onOpenSetup,
}) {
  return (
    <header className="topbar">
      <a className="brand" href="#">
        <span className="brand-mark">F</span>
        <span>
          FairEnrol <span className="brand-badge">RMIT 2026</span>
        </span>
      </a>

      <div className="top-actions">
        <button
          className="button outline setup-guide-btn"
          onClick={onOpenSetup}
          title="TideCloak Setup Guide"
        >
          <span className="icon-gear">⚙</span> TideCloak Setup
        </button>

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
              "TideCloak · Not signed in"
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
            {isLoggingIn ? "Starting login…" : "Log in with TideCloak"}
          </button>
        )}
      </div>
    </header>
  );
}
