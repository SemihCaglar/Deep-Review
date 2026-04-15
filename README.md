# BILSEN Review Management System

A full-stack system for managing academic paper reviews, featuring AI-assisted review generation and relational reviewer management.

## Project Structure
- **/frontend:** Next.js 14 web application (React, Tailwind CSS).
- **/backend:** Express.js TypeScript API (TypeORM, SQLite).
- **/doc:** Architectural diagrams (PlantUML), project status, and design decisions.

## Tech Stack
- **Frontend:** Next.js, Lucide Icons, Tailwind.
- **Backend:** Node.js, Express, TypeScript.
- **Database:** SQLite (local file: `backend/database.sqlite`).
- **ORM:** TypeORM.

---

## 🚀 Setup & Installation

### 1. Prerequisites
- Node.js (v18+)
- npm

### 2. Clone and Install
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Initialize Database (Seeding)
To populate the SQLite database with mock users (Semih, Emily, etc.) and papers:
```bash
cd backend
npx ts-node src/seed.ts
```

---

## 🏃 Running the Application

### Start Backend Server
```bash
cd backend
npm run dev
```
- Server runs on: `http://localhost:3001`
- SQLite DB file: `backend/database.sqlite`

### Start Frontend Server
```bash
cd frontend
npm run dev
```
- Web App runs on: `http://localhost:3000`
- Access via Public IP/Ngrok: Fully supported via `-H 0.0.0.0` and Next.js proxy.

---

## 🛠 Features
- **Monorepo Design:** Clean separation of concerns.
- **SQLite Persistence:** No external database setup required.
- **Transparent API Proxy:** Seamless cross-origin fetching.
- **Team-Ready:** Comprehensive `.gitignore` and `README` for collaborative development.

---

## 📧 Template Placeholders Reference

The `Template` entity stores email templates used for system notifications.
When sending an email, the service replaces these placeholders with real values.

| Placeholder            | Description                                          |
|------------------------|------------------------------------------------------|
| `{{userName}}`         | Full name of the recipient user                      |
| `{{userEmail}}`        | Email address of the recipient user                  |
| `{{paperTitle}}`       | Title of the paper being referenced                  |
| `{{paperAbstract}}`    | Abstract of the paper                                |
| `{{roundNumber}}`      | Round number (e.g., `1`, `2`)                        |
| `{{deadline}}`         | Formatted deadline date (e.g., `2026-05-01`)         |
| `{{coordinatorName}}` | Name of the coordinator who triggered the action     |
| `{{declineReason}}`    | Reason provided by the reviewer for declining        |
| `{{extensionReason}}`  | Reason provided by the reviewer for an extension     |
| `{{resetLink}}`        | One-time password reset URL (expires in 15 minutes)  |
| `{{overleafLink}}`     | Overleaf link for the paper (if attached)            |

**Template names** (from `TemplateName` enum):

| Name                  | When it is sent                                    |
|-----------------------|----------------------------------------------------|
| `REVIEW_INVITATION`   | When a reviewer is assigned to a round             |
| `REVIEW_REMINDER`     | Periodic reminder before the deadline              |
| `DEADLINE_REMINDER`   | Sent 48 hours before the deadline                  |
| `REVIEW_OVERDUE`      | When the deadline passes without submission        |
| `DECLINE_REQUEST`     | When a reviewer requests to decline                |
| `EXTENSION_REQUEST`   | When a reviewer requests a deadline extension      |
| `DECLINE_APPROVED`    | When coordinator approves a decline request        |
| `DECLINE_REJECTED`    | When coordinator rejects a decline request         |
| `EXTENSION_APPROVED`  | When coordinator approves a deadline extension     |
| `EXTENSION_REJECTED`  | When coordinator rejects a deadline extension      |
| `ACCOUNT_APPROVED`    | When admin approves a new user account             |
| `ACCOUNT_REJECTED`    | When admin rejects a new user account              |
| `PASSWORD_RESET`      | Sent when a user requests a password reset         |

---

## ⚙️ SystemPolicy Keys Reference

The `SystemPolicy` entity holds global configuration. All values are stored as **strings**; the service layer casts them to the correct type.

| Key                                | Type      | Default | Description                                              |
|------------------------------------|-----------|---------|----------------------------------------------------------|
| `MAX_FAILED_LOGINS`                | `integer` | `5`     | Max failed logins before account lockout                 |
| `FAILED_LOGIN_WINDOW_MINS`         | `integer` | `10`    | Time window (minutes) for counting failed logins         |
| `ACCOUNT_LOCK_MINS`                | `integer` | `10`    | How long the account is locked after too many failures   |
| `PASSWORD_RESET_TOKEN_EXP_MINS`    | `integer` | `15`    | Password reset token expiry time (minutes)               |
| `DEFAULT_DEADLINE_DAYS`            | `integer` | `14`    | Default review deadline (in days from round creation)    |
| `MIN_REVIEWERS_PER_ROUND`          | `integer` | `2`     | Minimum number of reviewers required per round           |
| `MAX_ACTIVE_ASSIGNMENTS`           | `integer` | `5`     | Max concurrent active assignments per reviewer           |
| `ENABLE_AI_REVIEW`                 | `boolean` | `true`  | Toggle AI review generation on/off                       |
| `EMAIL_RETRY_COUNT`                | `integer` | `3`     | Number of retries for failed email sends                 |
| `EMAIL_RETRY_BACKOFF_SECS`         | `integer` | `30`    | Exponential backoff starting point (seconds)             |
| `EMAIL_SUBMISSION_TIMEOUT_SECS`    | `integer` | `30`    | Max time to submit email to service before retry         |
