[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

# FairEnrol — Verifiable Course Registration Without Favours

> **A decentralized, collective-governance course enrolment platform powered by TideCloak, strict FIFO queues, and 2-of-3 multi-party cryptographic authorization.**

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked) for RMIT Hackathon 2026.

---

## 1. Vision & Originality

Every semester, millions of university students compete for high-demand elective courses, clinical rotations, and laboratory slots. In conventional registration systems, queue placement and seat allocations are controlled by a centralized database and single-point administrators (registrars or database operators).

**FairEnrol** redesigns university course enrolment from the ground up:
- **No single person can move the line:** Queue positions are strictly First-In, First-Out (FIFO) and tamper-evident.
- **Collective Multi-Party Quorum (2-of-3):** No registrar can unilaterally "force enrol" a friend or jump the waitlist. Special exemptions require a public justification and independent approvals from at least 2 of 3 panel members (Head of School, Academic Advisor, Student Representative).
- **Zero-Compromise Privacy (E2EE):** Sensitive supporting documents (medical records, disability accommodation certificates) are encrypted using AES-GCM-256 before ledger submission. Only authorized approvers hold the cryptographic keys to decrypt and inspect the evidence.

---

## 2. Trust Constraint Insight

In traditional academic institutions, a severe **trust constraint** exists between the student body and administrative staff:
- **Single Point of Power:** A single database administrator or registrar with elevated privileges can manipulate queue order, sneak favoured students into closed courses, or drop legitimate enrolments without public accountability.
- **The Privacy vs. Transparency Dilemma:** When students legitimately require exceptions (e.g., chronic medical conditions, accessibility accommodations), universities either:
  1. Hide the entire process behind closed doors (breeding student distrust and suspicion of favouritism), or
  2. Risk leaking confidential health/personal records if reasons are shared.

**What becomes possible when this constraint is removed?**
Students gain absolute mathematical certainty that their position in line is respected. Legitimate exceptions are transparently announced to the community (preserving trust), while personal medical evidence remains strictly encrypted and accessible solely to authorized evaluators.

---

## 3. Value & Impact

### Who Benefits?
1. **Students:** Guaranteed that enrolment order is strictly first-come, first-served. Waitlisted students can audit every position change and verify that no unauthorized queue-jumping occurred.
2. **Academic & Equity Advisors:** Protected from external pressure, personal bias accusations, and administrative tampering. Exception decisions are shared across an independent panel.
3. **Universities & Accreditation Boards:** Tamper-evident hash-chained audit trails ensure compliance with fairness policies, FOI (Freedom of Information) requests, and anti-corruption regulations.

### Concrete Example:
A final-year computer science course (`COMP3100: Applied AI`) has a hard quota of 3 seats. Avery, Jordan, and Morgan take all seats. Riley is #1 on the waitlist. 
A student athlete or registrar's contact asks to be forced into the course. In traditional systems, the registrar pushes a button and the student gets in secretly. In FairEnrol:
- The registrar's unilateral override attempt is **blocked and logged**.
- A formal exception request must be submitted with a public reason and encrypted medical evidence.
- Both the Head of School and Student Representative must review and approve before the system executes the enrollment.

---

## 4. Why TideCloak Matters

FairEnrol uses **TideCloak** to establish decentralized identity and eliminate single-point-of-failure authentication:
- **Real OpenID Connect / Tide IAM Integration:** Uses `@tidecloak/react` (`TideCloakContextProvider`) to manage authentication state, session lifecycles, and cryptographic token verification.
- **Cryptographic Role Segregation:** Extracts verified identity claims (`preferred_username`, `email`, and `realm_access.roles`) to delineate Students, Registrars, and Panel Approvers.
- **Decentralized Authorization vs. UI Hiding:** Security is not enforced by merely hiding buttons. Administrative actions require cryptographic authentication; unauthorized attempts to decrypt confidential evidence trigger mathematical authentication tag failures (`AES-GCM` rejection).
- **Resilience & Graceful Offline Diagnostics:** If the local TideCloak dev container is offline, FairEnrol alerts the evaluator with setup instructions while maintaining interactive simulation workflows for judging.

---

## 5. Prototype & Storytelling: 3-Minute Demo Script

Judges can verify all trust properties through this interactive flow:

```
[Student View] ──> [Registrar View] ──> [Approver Panel] ──> [Audit Ledger Verification]
 Enrol & Check      Attempt Illegal       Inspect E2EE Evidence    Verify SHA-256 Chain
 FIFO Queue         Overrides (Blocked)   & Cast 2-of-3 Votes      Detect Tampering
```

### Step 1: The Baseline Queue (Student Persona)
1. In the **Demo Persona** dropdown, select `Student`.
2. Observe courses `COMP3100`, `ISYS3414`, and `COSC2408`.
3. Switch student to `Riley Nguyen (s04)`. Notice the status card: **You’re #1 in the waitlist** in `COMP3100`.

### Step 2: The Attack (Registrar Persona)
1. Switch to `Registrar (Admin & Quotas)`.
2. Click **"Attempt Illegal Overrides (Simulate Attack)"**.
3. **Observe:** The system blocks both attempts:
   - *Blocked queue jumping:* Registrar cannot bypass FIFO rules.
   - *Blocked panel manipulation:* Registrar cannot unilaterally alter the approver board.
4. Scroll to the **Public Audit Trail** and see both blocked attacks permanently recorded.

### Step 3: Legitimate Exception & E2EE Evidence (Approver Persona)
1. As Registrar, submit an exception request with attached confidential evidence:
   - Action: `Force Enrol`
   - Course: `COMP3100`
   - Student: `Riley Nguyen`
   - Public Reason: *"Accessibility accommodation: physical mobility accommodation."*
   - Check *"Attach Confidential E2EE Supporting Evidence"*.
   - Click **"Submit Exception for Quorum"**.
2. Switch to `Approver` persona (`Dr. Amara Okafor`).
3. Click **"Inspect Encrypted Evidence"**:
   - Click `1. Test Unauthorized Decryption (Blocked)`: Web Crypto API rejects with **Access Denied (AES-GCM tag mismatch)**.
   - Click `2. Decrypt as Approver Panel (Authorized)`: Decrypts the confidential medical note.
4. Click **"Approve as Dr. Amara Okafor"** (1 of 2 votes recorded).
5. Switch Approver to `Sam Williams` (Academic Advisor) and click **"Approve as Sam Williams"** (2 of 2 votes).
6. **Result:** Quorum is reached. Riley Nguyen is automatically enrolled into `COMP3100`.

### Step 4: Mathematical Ledger Verification
1. Scroll down to **Cryptographic Hash-Chained Audit Trail**.
2. Click **"Verify Ledger Integrity"**: All blocks are validated against the Genesis block using SHA-256.
3. Click **"Simulate DB Tampering"** (simulates a rogue administrator modifying historical database records).
4. Click **"Verify Ledger Integrity"** again: The system instantly flags **⛔ LEDGER TAMPERING DETECTED!** identifying the exact compromised block.

---

## Setup & Running Guide (Windows PowerShell)

### Prerequisites
- Node.js (v18+ or v20+ recommended)
- Windows PowerShell
- Docker Desktop (optional, for running live local TideCloak container)

### 1. Install Dependencies
```powershell
# Open terminal in project directory
cd "D:\hackingthon\hackathon-main"

# Install all npm dependencies
npm.cmd install
```

### 2. OIDC Server Configuration (Keycloak / TideCloak)
FairEnrol supports both Keycloak and TideCloak via OpenID Connect with **Authorization Code Flow + PKCE (S256)**:
- Configuration is configured in `.env.local`:
  ```properties
  VITE_OIDC_URL=http://localhost:8081
  VITE_OIDC_REALM=fairenrol
  VITE_OIDC_CLIENT_ID=fairenrol-app
  ```
- **Keycloak / TideCloak Client Settings:**
  - Realm: `fairenrol`
  - Client ID: `fairenrol-app`
  - Client authentication: `OFF` (Public client)
  - Valid redirect URIs: `http://localhost:5137/*`
  - Web origins: `http://localhost:5137`
  - Proof Key for Code Exchange (PKCE) Code Challenge Method: `S256`

> **Note:** If the OIDC server is offline, FairEnrol gracefully enters **Local Interactive Mode** so judges can evaluate all cryptographic and governance workflows without setup friction.

### 3. Run the Automated Test Suite
```powershell
npm.cmd test
```
*Executes all 5 cryptographic tests: SHA-256 hashing, hash chain verification, tampering detection, AES-GCM-256 encryption, and unauthorized key rejection.*

### 4. Launch the Application
```powershell
npm.cmd run dev
```
Open **[http://localhost:5137/](http://localhost:5137/)** in your browser.

### 5. Production Build Verification
```powershell
npm.cmd run build
```

---

## Technical Architecture & File Structure

```
hackathon-main/
├── public/
│   ├── silent-check-sso.html       # Silent SSO check iframe for TideCloak
│   ├── tidecloak.json              # Active TideCloak realm configuration
│   └── tidecloak.sample.json       # Template configuration for fairenrol realm
├── src/
│   ├── components/
│   │   ├── Header.jsx              # Navigation, TideCloak auth badge, login/logout
│   │   ├── CourseGrid.jsx          # Course quotas, FIFO waitlist tracking
│   │   ├── RegistrarDashboard.jsx  # Quota management, blocked override demo
│   │   ├── ApproverDashboard.jsx   # 2-of-3 quorum consensus, vote tracking
│   │   ├── RequestForm.jsx         # Exception submission with AES-GCM evidence
│   │   ├── EvidenceModal.jsx       # Interactive E2EE decryption proof
│   │   ├── AuditLogView.jsx        # SHA-256 hash-chained public audit ledger
│   │   ├── ComparisonSection.jsx   # Architectural contrast comparison
│   │   └── TideCloakSetupModal.jsx # Visual Docker & realm configuration guide
│   ├── services/
│   │   ├── crypto.js               # W3C Web Crypto API (SHA-256, AES-GCM-256)
│   │   └── tidecloak.js            # Token extraction, claims mapping, Docker config
│   ├── App.jsx                     # State orchestrator & persona switcher
│   ├── main.jsx                    # React entrypoint wrapped with TideCloakContextProvider
│   ├── seed.json                   # Synthetic course & student data
│   └── style.css                   # Responsive academic styling & theme tokens
├── test-crypto.js                  # Automated cryptographic test suite
├── package.json                    # Project metadata, scripts, and dependencies
├── vite.config.js                  # Vite configuration (port 5137, strictPort: true)
├── AGENTS.md                       # Hackathon governance and development rules
├── README.md                       # Hackathon project documentation (this file)
└── Video.mp4                       # Project demonstration video
```

---

## Compliance & Definition of Done Summary

- [x] **Project Integrity:** Preserved at `D:\hackingthon\hackathon-main`; no new nested projects created.
- [x] **Preserved Assets:** `Video.mp4`, `public/`, and existing student fixtures preserved.
- [x] **Real TideCloak Integration:** `@tidecloak/react` (`TideCloakContextProvider`, `useTideCloak`) fully configured with `tidecloak.json`, silent SSO, and role claims handling.
- [x] **Trust Constraint Solved:** Real cryptographic guarantees (W3C AES-GCM-256 and SHA-256 hash chaining) ensure queue fairness and prevent administrative tampering.
- [x] **Mathematical Access Control:** Unauthorized decryption attempts are rejected cryptographically by Web Crypto, not merely hidden in the UI.
- [x] **Testing & Verification:** `npm.cmd test` and `npm.cmd run build` pass with zero errors.
- [x] **Storytelling & Documentation:** Complete 5-criteria README with 3-minute demo script for RMIT Hackathon 2026.
