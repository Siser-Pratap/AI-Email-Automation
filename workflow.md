# AutoMail.ai — Workflow & Functionality Guide

## Overview

AutoMail.ai is an AI-driven HR outreach automation platform built for job seekers. It automates email campaigns to HR professionals, generates personalized content using GPT-4o, manages resumes with smart role-matching, and provides a secure admin dashboard to control everything.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Prisma ORM · MongoDB · TailwindCSS · OpenAI GPT-4o · Nodemailer

---

## Project Structure

```
ai-email-automation/
├── src/
│   ├── app/
│   │   ├── (public)/          # Unauthenticated pages: landing, login
│   │   ├── (protected)/       # Auth-gated pages: dashboard, templates, logs, resumes
│   │   └── api/               # REST API route handlers
│   ├── components/            # Shared React components (Sidebar, Providers)
│   ├── lib/                   # Utilities: email sender, resume matcher, template vars
│   └── proxy.ts               # Next.js middleware for route protection
├── scripts/                   # Standalone Node.js scripts: cron, seed
├── prisma/
│   └── schema.prisma          # MongoDB models
└── public/                    # Static assets & resume file storage
```

---

## Authentication

Access to all protected routes is gated by a 6-digit PIN.

- **Login:** User enters PIN at `/login`. On success, an HTTP-only cookie (`admin_token`) is set with 24-hour expiration.
- **Middleware:** `src/proxy.ts` intercepts requests to `/dashboard`, `/templates`, `/logs`, and `/resumes`. If the cookie is missing or invalid, the user is redirected to `/login`.
- **Logout:** Clears the cookie and redirects to the landing page.
- **PIN config:** Set via `NEXT_PUBLIC_ADMIN_PIN` environment variable (default: `171020`).

---

## Core Features

### 1. Email Campaign Management (Dashboard)

**Route:** `/dashboard` | **File:** `src/app/(protected)/dashboard/page.tsx`

The dashboard is the primary control center. It displays all email entries in a table and exposes full CRUD + send controls.

**Email Entry Fields:**
| Field | Values |
|---|---|
| `hrEmail` | Recipient's email address |
| `companyName` | Target company |
| `role` | Job role/title |
| `emailType` | `REFERRAL` · `APPLICATION` · `INTEREST` · `FOLLOWUP` |
| `status` | `PENDING` · `SENT` · `FAILED` · `BACKLOG` |
| `scheduledAt` | When the email should go out |
| `notes` | Custom notes injected into email generation |
| `retryCount` | Tracks automatic retry attempts (max 3) |

**Available Actions:**
- **New Entry** — Create a new email campaign entry with status `PENDING`
- **Edit** — Update any field on an existing entry
- **Delete** — Remove an entry from the database
- **Send Pending (All)** — Immediately trigger `POST /api/send-pending` to send all `PENDING` entries
- **Send** — Send a single entry by ID (`POST /api/send-single`)
- **Resend** — Re-trigger sending for a previously sent or failed entry
- **Follow-up** — Send a follow-up email threaded to the original (uses stored `messageId`)
- **Move to Backlog / Restore** — Toggle entry status between `BACKLOG` and `PENDING`
- **Start / Stop Cron** — Toggle the automation scheduler on or off

State is managed via **React Query** (`@tanstack/react-query`) with toast notifications via **Sonner**.

---

### 2. Email Template Management

**Route:** `/templates` | **File:** `src/app/(protected)/templates/page.tsx`

Templates define the subject and HTML body for each email type. Variables are injected at send time.

**Template Types:** `APPLICATION` · `REFERRAL` · `INTEREST` · `FOLLOWUP`

**Supported Variables:**
```
{{company}}   →  companyName from EmailEntry
{{role}}      →  role from EmailEntry
{{name}}      →  name from EmailEntry
{{jobId}}     →  jobId from EmailEntry (for referrals)
```

**Editor Features:**
- Full HTML editor with a formatting toolbar (Bold, Italic, Heading, Lists, Links)
- Live preview mode to see rendered output
- Upsert logic — saving a template for a given type creates or updates it (no duplicates per type)
- DELETE support to remove templates by ID

**API:** `GET/POST /api/templates` · `DELETE /api/templates/[id]`

---

### 3. Resume Management

**Route:** `/resumes` | **File:** `src/app/(protected)/resumes/page.tsx`

Users can upload multiple resumes. At send time, the system automatically selects the best resume for the target role.

**Upload:**
- Accepts PDF, DOC, DOCX
- Files are base64-encoded in the browser and sent to `POST /api/resumes`
- Metadata (title, description, filename) is stored in the database

**Resume Matching Algorithm** (`src/lib/resume-matcher.ts`):
1. Extract keywords from the job role string
2. Score each resume:
   - +2 points per keyword match in resume **title**
   - +1 point per keyword match in resume **description**
3. Select the highest-scoring resume
4. If no match or no metadata, fall back to a default resume file

**API:** `GET /api/resumes` · `POST /api/resumes` · `DELETE /api/resumes/[id]`

---

### 4. Email Sending Flow

**Core utility:** `src/lib/email.ts` (Nodemailer + Gmail SMTP)

When any send action is triggered, the following steps execute:

```
1. Fetch EmailTemplate by emailType
2. Replace template variables ({{company}}, {{role}}, etc.)
3. Run resume matching → select best PDF for the role
4. Build email payload:
   - Standard emails (APPLICATION, REFERRAL, INTEREST):
       → standalone email
   - FOLLOWUP:
       → sets `inReplyTo` and `references` headers using stored messageId
       → Gmail threads it as a reply to the original email
5. Send via Nodemailer (Gmail SMTP)
6. Create EmailLog entry (SUCCESS or FAILURE + raw response)
7. Update EmailEntry:
   - Status → SENT (or FAILED after 3 retries)
   - Store messageId for future follow-up threading
   - Update lastSentAt timestamp
```

**SMTP Configuration (via `.env`):**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<gmail address>
SMTP_PASS=<gmail app password>
SMTP_FROM=Display Name <email@gmail.com>
```

---

### 5. Cron Job Automation

The platform supports two ways to run automated sending:

#### A. Node.js Cron Script (`scripts/cron.ts`)
- **Schedule:** `0 9 * * 1-4` — 9:00 AM, Monday through Thursday
- Run manually with `npm run cron`
- Checks `AppSetting { key: "cron_active" }` before processing — stops immediately if paused
- Fetches all `PENDING` entries with `scheduledAt ≤ now`
- Processes up to 50 entries per run
- On failure: increments `retryCount`; marks `FAILED` after 3 attempts

#### B. API Cron Endpoint (`GET /api/cron`)
- For use with external schedulers (Vercel Cron, AWS EventBridge, etc.)
- Requires `Authorization: Bearer <CRON_SECRET>` header
- Same processing logic as the script

#### Cron Control (`/api/cron/control`)
- `GET` → returns `{ active: boolean }` from `AppSetting` in DB
- `POST { action: "start" | "stop" }` → updates `AppSetting`
- Dashboard Start/Stop button calls this endpoint

---

### 6. AI Email Generation

**Endpoint:** `POST /api/generate-email` | **File:** `src/app/api/generate-email/route.ts`

Generates a personalized email body using OpenAI GPT-4o via the Vercel AI SDK.

**Input:**
```json
{
  "companyName": "Acme Corp",
  "role": "Backend Engineer",
  "emailType": "APPLICATION",
  "notes": "Found via LinkedIn, referral from John"
}
```

**Output:** A concise, professional HR outreach email body (under 150 words).

The generated content is returned to the frontend and can be used to populate or seed an email template.

---

### 7. Activity Logs

**Route:** `/logs` | **File:** `src/app/(protected)/logs/page.tsx`

Every send attempt (success or failure) is recorded in the `EmailLog` collection.

**Log Entry Fields:**
| Field | Description |
|---|---|
| `timestamp` | When the attempt occurred |
| `emailEntryId` | Foreign key to the `EmailEntry` |
| `status` | `SUCCESS` or `FAILURE` |
| `response` | Raw SMTP response or error message |

The log page displays the **last 100 entries** with status badges for quick scanning.

**API:** `GET /api/logs`

---

## Database Models

**Provider:** MongoDB Atlas via Prisma ORM

```
EmailEntry       — one campaign entry per recipient
  └── EmailLog[] — log records for each send attempt

EmailTemplate    — one per emailType (unique constraint)

AppSetting       — key-value store for runtime config (e.g., cron_active)
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/emails` | List all email entries |
| `POST` | `/api/emails` | Create new entry |
| `PATCH` | `/api/emails/[id]` | Update entry fields |
| `DELETE` | `/api/emails/[id]` | Delete entry |
| `POST` | `/api/send-pending` | Send all pending entries now |
| `POST` | `/api/send-single` | Send one entry by ID |
| `POST` | `/api/test-email` | Send a test email |
| `GET` | `/api/templates` | List all templates |
| `POST` | `/api/templates` | Create or update template |
| `DELETE` | `/api/templates/[id]` | Delete template |
| `GET` | `/api/resumes` | List resumes with metadata |
| `POST` | `/api/resumes` | Upload new resume |
| `DELETE` | `/api/resumes/[id]` | Delete resume |
| `GET` | `/api/logs` | Fetch last 100 activity logs |
| `GET` | `/api/cron` | Trigger cron processing (external scheduler) |
| `GET` | `/api/cron/control` | Get cron active status |
| `POST` | `/api/cron/control` | Start or stop cron |
| `POST` | `/api/generate-email` | AI-generate email body via GPT-4o |

---

## NPM Scripts

```bash
npm run dev              # Start Next.js dev server
npm run build            # prisma generate + next build
npm run start            # Start production server
npm run cron             # Run cron job manually (tsx scripts/cron.ts)
npm run seed             # Seed initial email entries
npm run seed-templates   # Seed default email templates
npm run seed-followup    # Seed follow-up template
```

---

## End-to-End Workflow Examples

### Sending a New Application Email
1. Go to `/templates` → create/edit the `APPLICATION` template with HTML body and subject
2. Go to `/resumes` → upload your resume PDF with a descriptive title
3. Go to `/dashboard` → click **New Entry**, fill in HR email, company, role, type = `APPLICATION`, set `scheduledAt`
4. Either wait for the 9 AM cron to fire, or click **Send Pending** to trigger immediately
5. Check `/logs` to confirm `SUCCESS` and see the SMTP response

### Sending a Threaded Follow-up
1. Find a `SENT` entry on the Dashboard (it has a stored `messageId`)
2. Click **Follow-up** → `POST /api/send-single` is called with type `FOLLOWUP`
3. The email is sent with `inReplyTo` and `references` headers pointing to the original
4. The recipient's Gmail client groups it in the same thread

### Pausing Automation
1. On the Dashboard, click **Stop Cron**
2. This calls `POST /api/cron/control { action: "stop" }` → sets `AppSetting.cron_active = "false"`
3. All future cron runs check this flag and exit early without sending
4. Click **Start Cron** to resume
