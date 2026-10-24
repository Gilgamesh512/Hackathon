[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

# FairEnrol — Verifiable Course Registration Without Favours

> **A privacy-preserving, collective-governance university course enrolment platform powered by TideCloak, strict FIFO queues, 2-of-3 multi-party cryptographic authorization, and an Explainable Fairness Monitor.**

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked) for RMIT Hackathon 2026.

---

## 1. Vision & Originality

Every semester, millions of university students compete for high-demand elective courses, clinical rotations, and laboratory slots. In conventional registration systems, queue placement and seat allocations are controlled by a centralized database and single-point administrators (registrars or database operators).

**FairEnrol** redesigns university course enrolment from the ground up:
- **No single person can move the line:** Queue positions are strictly First-In, First-Out (FIFO), tamper-evident, and automatically promoted upon seat release or capacity expansion.
- **Collective Multi-Party Quorum (2-of-3):** No registrar can unilaterally "force enrol" a friend or jump the waitlist. Special exemptions require a public justification and independent approvals from at least 2 of 3 panel members (Head of School, Academic Advisor, Student Representative).
- **Zero-Compromise Privacy (AES-GCM-256 with AAD):** Sensitive supporting documents (medical certificates, accessibility accommodation records) are encrypted using W3C Web Crypto AES-GCM-256 with Authenticated Additional Data (AAD) binding ciphertext to the exact student and course context.
- **Explainable Fairness Monitor:** A real-time, rule-based auditing engine that monitors queue health, detects timing anomalies (e.g. capacity expansions right before force-enrolment), tracks repeated single-actor requests, and evaluates ledger integrity.
- **Anchored Hash Chain:** SHA-256 hash chaining with an independent Checkpoint Anchor, providing provable tamper-evidence against rogue database administrators who attempt full-history recalculations.

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
1. **Students:** Guaranteed that enrolment order is strictly first-come, first-served. Waitlisted students can audit every position change, witness automatic FIFO promotion when seats open, and verify that no unauthorized queue-jumping occurred.
2. **Academic & Equity Advisors:** Protected from external pressure, personal bias accusations, and administrative tampering. Exception decisions are shared across an independent panel with recorded multi-signature consensus.
3. **Universities & Accreditation Boards:** Tamper-evident hash-chained audit trails ensure compliance with fairness policies, FOI (Freedom of Information) requests, and anti-corruption regulations.

### Concrete Example:
A final-year computer science course (`COMP3100: Applied AI`) has a hard quota of 3 seats. Avery, Jordan, and Morgan take all seats. Riley is #1 on the waitlist. 
A student athlete or registrar's contact asks to be forced into the course. In traditional systems, the registrar pushes a button and the student gets in secretly. In FairEnrol:
- The registrar's unilateral override attempt is **blocked and permanently logged**.
- A formal exception request must be submitted with a public reason and E2EE encrypted medical evidence.
- Both the Head of School and Student Representative must review and approve before the system executes the enrollment.
- When an enrolled student withdraws, Riley is automatically promoted into the confirmed seat via FIFO dispatch without human intervention.

---

## 4. Why TideCloak Matters

FairEnrol uses **TideCloak** to establish decentralized identity and eliminate single-point-of-failure authentication:
- **Real OpenID Connect / Tide IAM Integration:** Uses `@tidecloak/react` (`TideCloakContextProvider`) and `keycloak-js` to manage authentication state, session lifecycles, and cryptographic token verification via Authorization Code Flow + PKCE (S256).
- **Cryptographic Role Segregation:** Extracts verified identity claims (`preferred_username`, `email`, and `realm_access.roles`) to delineate Students, Registrars, and Panel Approvers.
- **Decentralized Authorization vs. UI Hiding:** Security is not enforced by merely hiding buttons. Administrative actions require cryptographic authentication; unauthorized attempts to decrypt confidential evidence trigger mathematical authentication tag failures (`AES-GCM` rejection).
- **Resilience & Graceful Offline Diagnostics:** If the local TideCloak dev container is offline, FairEnrol alerts the evaluator with setup instructions while maintaining interactive simulation workflows for judging.

---

## 5. Prototype & Storytelling: 3-to-5 Minute Demo Script

Judges can verify all trust properties through this interactive flow:

```
[Student View] ──> [Registrar View] ──> [Approver Panel] ──> [Fairness Monitor] ──> [Audit Ledger]
 Enrol & Check      Attempt Illegal       Inspect E2EE Evidence   Inspect Rule Anomalies    Verify SHA-256 Chain
 FIFO Queue         Overrides (Blocked)   & Cast 2-of-3 Votes     & Queue Matrix            Catch DB Tampering
```

### Step 1: The Baseline Queue & FIFO Enrolment (Student Persona)
1. On the top navigation bar, ensure **University Portal & Role Workflows** is active.
2. In the **Demo Persona** dropdown, select `Student`.
3. Choose `Riley Nguyen (s04)`. Notice the status card: **You’re #1 in the waitlist** in `COMP3100`.
4. Switch to `Avery Chen (s01)` (who is enrolled in `COMP3100`).
5. Click **"Withdraw from Course"**.
6. **Observe the magic:** Avery's seat is released, and the FairEnrol Automated Dispatcher immediately triggers an automatic FIFO promotion.
7. Switch back to `Riley Nguyen (s04)`: Riley is now **Enrolled · Seat Confirmed**!

### Step 2: The Attack (Registrar Persona)
1. Switch persona to `Registrar (Admin & Quotas)`.
2. Notice the courses grid displaying capacities and exact FIFO waitlist sequences.
3. Click **"Attempt Illegal Overrides (Simulate Attack)"**.
4. **Observe:** The system governance policy rejects both attacks:
   - *Blocked queue jumping:* Registrar cannot bypass FIFO rules or inject favorites.
   - *Blocked panel manipulation:* Registrar cannot unilaterally alter the approver board.
5. Both blocked attempts are permanently recorded to the public ledger.

### Step 3: Legitimate Exception & E2EE Evidence (Approver Persona)
1. As Registrar, submit an exception request with attached confidential evidence:
   - Exception Type: `Force Enrol (Seat Capacity Exemption)`
   - Course: `COMP3100`
   - Student: `Casey Taylor (s05)`
   - Public Reason: *"Accessibility accommodation: student requires specialized ground-floor lab equipment."*
   - Check *"Attach Confidential E2EE Supporting Evidence"*.
   - Click **"Submit Exception for Quorum"**.
2. Switch persona to `Approver` (`Dr. Amara Okafor`).
3. Under *Active Proposals Awaiting Vote*, click **"Inspect E2EE Evidence"**:
   - Click `1. Test Unauthorized Key (Blocked)`: Web Crypto API rejects with **Access Denied (AES-GCM tag mismatch)**.
   - Click `2. Test AAD Replay Attack (Blocked)`: Replaying ciphertext under another student ID fails due to Authenticated Additional Data binding.
   - Click `3. Decrypt as Approver Panel (Authorized)`: Decrypts the confidential medical note.
4. Click **"Approve as Dr. Amara Okafor"** (1 of 2 votes recorded in progress meter).
5. Switch Approver persona to `Sam Williams` (Academic Advisor) and click **"Approve as Sam Williams"** (2 of 2 votes).
6. **Result:** Quorum is reached. Casey Taylor is automatically enrolled into `COMP3100`.

### Step 4: Explainable Fairness Monitor
1. Switch the main navigation tab to **"🔍 Explainable Fairness Monitor"**.
2. Inspect the **Fairness Index Score** (e.g. 100%), Active Quorums, and Course Health Matrix.
3. Review rule findings:
   - Correlated capacity adjustments
   - Quorum compliance reports
   - Stalled waitlists detection

### Step 5: Mathematical Ledger Verification & Tamper Resistance
1. Scroll down to **Cryptographic Hash-Chained Public Audit Trail**.
2. Notice the **Independent Checkpoint Integrity Anchor** pill.
3. Click **"Verify Ledger Integrity"**: All blocks are validated against the Genesis block using SHA-256 and matched with the external anchor.
4. Click **"Simulate Block Edit"**: Modifies historical text in memory.
5. Click **"Verify Ledger Integrity"**: Instantly flags **⛔ LEDGER INTEGRITY BREACH DETECTED!** identifying the exact corrupted block.
6. Click **"Simulate Full Chain Rewrite"**: Simulates a rogue administrator recalculating all subsequent block hashes.
7. Click **"Verify Ledger Integrity"**: The Checkpoint Anchor catches the rewrite attack!
8. Click **"Restore Clean Ledger"** to return to pristine state.
9. Click **"Export Ledger JSON"** to download the canonical audit records for offline auditing.

---

## 6. Threat Model & Security Boundaries

| Asset / Boundary | Threat / Adversary | Mitigation in FairEnrol |
| :--- | :--- | :--- |
| **Waitlist Order** | Rogue registrar attempting to prioritize friends or alumni contacts | Client-side and server-enforced strict FIFO sequencing; automatic queue promotion; registrar has seat quota adjustments only, zero direct queue-write privilege. |
| **Exceptional Decisions** | Single administrator granting unilateral exemptions behind closed doors | Mandatory 2-of-3 multi-party quorum with distinct cryptographic identities; self-approval prohibited; conflict-of-interest detection. |
| **Medical / Equity Evidence** | Data breach or unauthorized inspection of sensitive health records | Authenticated AES-GCM-256 encryption. Key held exclusively by authorized panel; ciphertext cryptographically bound to student context via Authenticated Additional Data (AAD). |
| **Audit Log Integrity** | Database operator rewriting historical records to hide past favoritism | SHA-256 canonical hash chaining + Independent Checkpoint Anchor. Detects both single-entry edits and whole-chain recalculated rewrites. |
| **Concurrent Seat Claims** | Multiple students simultaneously clicking enrol on the final remaining seat | Atomic concurrency reservation locks ensure strictly 1 claimant receives the seat and the second is placed in waitlist position #1 with zero over-enrolment. |

---

## 7. Setup & Running Guide (Windows PowerShell)

### Prerequisites
- Node.js (v18+ or v20+ recommended)
- Windows PowerShell
- Docker Desktop (optional, for running live local TideCloak container)

### 1. Install Dependencies
```powershell
# Open terminal in project directory
cd "D:\Hackathon"

# Install all dependencies
npm.cmd install
```

### 2. Configure Environment
A template file `.env.example` is provided:
```properties
VITE_OIDC_URL=http://localhost:8081
VITE_OIDC_REALM=fairenrol
VITE_OIDC_CLIENT_ID=fairenrol-app
```
Copy it to `.env.local`:
```powershell
Copy-Item .env.example .env.local
```

### 3. Run Automated Invariant & Cryptographic Test Suite
```powershell
npm.cmd test
```
*Executes all 16 automated tests across both suites (`test-crypto.js` and `test-fairenrol.js`), verifying FIFO invariants, 2-of-3 quorum, concurrency locks, tamper detection, Checkpoint Anchoring, AES-GCM + AAD, and anomaly detection.*

### 4. Launch Application in Development Mode
```powershell
npm.cmd run dev
```
Open **[http://localhost:5137/](http://localhost:5137/)** in your browser.

### 5. Production Build Verification
```powershell
npm.cmd run build
```

### 6. Live TideCloak Container Setup (Optional)
To run a live local TideCloak dev container:
```powershell
docker run -d -p 8081:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=password tideorg/tidecloak-dev:latest
node setup-realm.js
```

---

## 8. Technical Architecture & File Structure

```
Hackathon/
├── public/
│   ├── silent-check-sso.html       # Silent SSO check iframe for Keycloak / TideCloak
│   ├── tidecloak.json              # Active TideCloak realm configuration
│   └── tidecloak.sample.json       # Template configuration for fairenrol realm
├── src/
│   ├── components/
│   │   ├── Header.jsx              # Navigation, auth badge, login/logout controls
│   │   ├── CourseGrid.jsx          # Course quotas, FIFO waitlist, withdrawal, concurrency race test
│   │   ├── RegistrarDashboard.jsx  # Quota management, blocked override demo, promotion sweep
│   │   ├── ApproverDashboard.jsx   # 2-of-3 quorum consensus, vote tracking, conflict-of-interest guard
│   │   ├── RequestForm.jsx         # Exception submission with AES-GCM + AAD evidence
│   │   ├── EvidenceModal.jsx       # Interactive E2EE decryption proof & AAD replay test
│   │   ├── AuditLogView.jsx        # SHA-256 hash-chained public audit ledger & Checkpoint Anchor
│   │   ├── FairnessMonitorView.jsx # Explainable Fairness Monitor & Anomaly Detector Dashboard
│   │   ├── ComparisonSection.jsx   # Architectural contrast comparison
│   │   └── TideCloakSetupModal.jsx # Visual Docker & realm configuration guide
│   ├── services/
│   │   ├── crypto.js               # W3C Web Crypto API (SHA-256, AES-GCM-256 + AAD, Canonical JSON)
│   │   ├── fairnessMonitor.js      # Rule-based anomaly detector (timing, overrides, concentration)
│   │   ├── keycloak.js             # Keycloak OIDC client singleton (PKCE S256)
│   │   └── tidecloak.js            # TideCloak token extraction & profile claims mapping
│   ├── contexts/
│   │   └── KeycloakContext.jsx     # React Context Provider for OpenID Connect authentication state
│   ├── App.jsx                     # State orchestrator, reducer lifecycle & tab router
│   ├── main.jsx                    # React entrypoint
│   ├── seed.json                   # Synthetic course & student data
│   └── style.css                   # Responsive academic styling & theme tokens
├── test-crypto.js                  # Baseline cryptographic unit tests
├── test-fairenrol.js               # Comprehensive 11-rule security & workflow invariant test suite
├── setup-realm.js                  # Automated script to configure realm, client, roles and users in TideCloak
├── package.json                    # Project metadata, scripts, and dependencies
├── vite.config.js                  # Vite configuration (port 5137)
├── AGENTS.md                       # Hackathon governance and development rules
├── README.md                       # Complete project documentation (this file)
└── Video.mp4                       # Project demonstration video
```

---

## 9. Known Limitations & Production Hardening Roadmap

While FairEnrol delivers an end-to-end, mathematically provable prototype for RMIT Hackathon 2026, the following items outline the pathway to institutional production deployment:
1. **Hardware / Decentralized Key Management:** In production, approver panel decryption keys should be backed by hardware security modules (HSM) or WebAuthn / Tide decentralized key shares rather than derived passphrase credentials.
2. **Decentralized Anchor Ledger:** The Checkpoint Anchor can be committed periodically to a public timestamping service (e.g. OpenTimestamps or Ethereum / Polygon smart contract) to provide cross-organizational public verifiability beyond university boundaries.
3. **Database Backend:** For multi-server clusters, replace in-memory reducer persistence with PostgreSQL using serialized isolation levels (`SELECT ... FOR UPDATE`) to enforce database-level FIFO locks.
