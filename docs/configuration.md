# Configuration & Email Templates Reference

This document is the developer reference for the `Template` and `SystemPolicy` entities introduced in Issue #39.

---

## 📧 Email Template Placeholders

The `Template` entity stores email templates used for system notifications.
When sending an email, the service replaces `{{placeholder}}` tokens with real values at send time.

| Placeholder           | Description                                         |
|-----------------------|-----------------------------------------------------|
| `{{userName}}`        | Full name of the recipient user                     |
| `{{userEmail}}`       | Email address of the recipient user                 |
| `{{paperTitle}}`      | Title of the paper being referenced                 |
| `{{paperAbstract}}`   | Abstract of the paper                               |
| `{{roundNumber}}`     | Round number (e.g., `1`, `2`)                       |
| `{{deadline}}`        | Formatted deadline date (e.g., `2026-05-01`)        |
| `{{coordinatorName}}` | Name of the coordinator who triggered the action    |
| `{{declineReason}}`   | Reason provided by the reviewer for declining       |
| `{{extensionReason}}` | Reason provided by the reviewer for an extension    |
| `{{resetLink}}`       | One-time password reset URL (expires in 15 minutes) |
| `{{overleafLink}}`    | Overleaf link for the paper (if attached)           |

---

## 📬 Template Names (`TemplateName` enum)

| Enum Value            | When it is sent                                        |
|-----------------------|--------------------------------------------------------|
| `REVIEW_INVITATION`   | When a reviewer is assigned to a round                 |
| `REVIEW_REMINDER`     | Periodic reminder before the deadline                  |
| `DEADLINE_REMINDER`   | Sent 48 hours before the deadline                      |
| `REVIEW_OVERDUE`      | When the deadline passes without a submitted review    |
| `DECLINE_REQUEST`     | When a reviewer requests to decline an assignment      |
| `EXTENSION_REQUEST`   | When a reviewer requests a deadline extension          |
| `DECLINE_APPROVED`    | When the coordinator approves a decline request        |
| `DECLINE_REJECTED`    | When the coordinator rejects a decline request         |
| `EXTENSION_APPROVED`  | When the coordinator approves a deadline extension     |
| `EXTENSION_REJECTED`  | When the coordinator rejects a deadline extension      |
| `ACCOUNT_APPROVED`    | When an admin approves a new user account              |
| `ACCOUNT_REJECTED`    | When an admin rejects a new user account               |
| `PASSWORD_RESET`      | Sent when a user requests a password reset             |

---

## ⚙️ SystemPolicy Keys (`PolicyKey` enum)

All policy values are stored as **text strings** in the database. The service layer is responsible for casting them to the correct type.

| Enum Key                         | Type      | Default  | Description                                              |
|----------------------------------|-----------|----------|----------------------------------------------------------|
| `MAX_FAILED_LOGINS`              | `integer` | `5`      | Max failed logins before account lockout                 |
| `FAILED_LOGIN_WINDOW_MINS`       | `integer` | `10`     | Time window (minutes) for counting failed logins         |
| `ACCOUNT_LOCK_MINS`              | `integer` | `10`     | How long the account is locked after too many failures   |
| `PASSWORD_RESET_TOKEN_EXP_MINS`  | `integer` | `15`     | Password reset token expiry time (minutes)               |
| `DEFAULT_DEADLINE_DAYS`          | `integer` | `14`     | Default review deadline in days from round creation      |
| `MIN_REVIEWERS_PER_ROUND`        | `integer` | `2`      | Minimum number of reviewers required per round           |
| `MAX_ACTIVE_ASSIGNMENTS`         | `integer` | `5`      | Max concurrent active assignments per reviewer           |
| `ENABLE_AI_REVIEW`               | `boolean` | `true`   | Toggle AI review generation on/off                       |
| `EMAIL_RETRY_COUNT`              | `integer` | `3`      | Number of retries on failed email sends                  |
| `EMAIL_RETRY_BACKOFF_SECS`       | `integer` | `30`     | Exponential backoff starting point (seconds)             |
| `EMAIL_SUBMISSION_TIMEOUT_SECS`  | `integer` | `30`     | Max time (seconds) to submit an email before retry       |
