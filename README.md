# AHL Task Manager

Next.js 14 + Firebase Firestore task delegation system with WhatsApp (WAHA) notifications.

---

## Stack

- **Frontend/Backend:** Next.js 14 App Router
- **Database:** Firebase Firestore
- **Auth:** Firebase Auth (custom token via WA number)
- **Notifications:** WAHA (WhatsApp HTTP API)
- **Deployment:** Vercel (or any Node.js host)
- **Styling:** Tailwind CSS + DM Sans

---

## Project Structure

```
app/
  api/
    auth/login/       — WA number login → custom token
    auth/session/     — Exchange ID token for session cookie
    tasks/            — CRUD tasks
    tasks/[id]/       — Accept / complete / verify
    revisions/        — Request + decide revisions
    users/            — User management
    scores/           — MIS scores
    webhook/          — WAHA inbound WhatsApp commands
    reminders/        — Cron: send due/overdue reminders
  (portal)/
    admin/            — Admin dashboard, calendar, tasks, scores, users
    portal/           — User portal: my tasks, dept, revisions, score
  login/              — WA number login page

lib/
  firebase/
    client.ts         — Firebase client SDK
    admin.ts          — Firebase Admin SDK
    users.ts          — User CRUD
    tasks.ts          — Task CRUD + ID generation
    revisions.ts      — Revision log CRUD
    scores.ts         — Score tracking + logging
  waha/
    index.ts          — sendWhatsApp + all message templates
  utils/
    auth.ts           — Session cookie helpers
    index.ts          — cn, formatDate, color maps

components/
  shared/
    Sidebar.tsx       — Navigation sidebar (admin + user)
    TaskModal.tsx     — Task detail + actions modal
    TaskListClient.tsx— Filterable task table
    CreateTaskForm.tsx — Task creation form
    RevisionsClient.tsx— Revision approve/reject UI
    ScoresClient.tsx  — Score rankings
  admin/
    AdminDashboardClient.tsx — Delegatee cards
    CalendarClient.tsx       — Month calendar grid
    UsersClient.tsx          — User management table
```

---

## Setup

### 1. Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create new project
3. Enable **Firestore Database** (production mode)
4. Enable **Firebase Authentication** → Sign-in method → enable **Custom** (not any provider, just enable auth)
5. Go to Project Settings → Service Accounts → Generate new private key → download JSON

### 2. Firestore Indexes

Create these composite indexes in Firestore console (or deploy `firestore.indexes.json`):

```
tasks: assignedTo ASC, createdAt DESC
tasks: department ASC, status ASC, createdAt DESC
tasks: handoffUid ASC, createdAt DESC
tasks: endDate ASC, status ASC
revisionLog: status ASC, createdAt DESC
```

### 3. Firestore Security Rules

Deploy `firestore.rules` from the project root:
```bash
firebase deploy --only firestore:rules
```

### 4. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```env
# Firebase Client (from Project Settings → Your apps → Web app)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (from service account JSON)
FIREBASE_PROJECT_ID=          # same as project_id in JSON
FIREBASE_CLIENT_EMAIL=        # client_email from JSON
FIREBASE_PRIVATE_KEY=         # private_key from JSON (keep the \n chars)

# WAHA
WAHA_URL=https://your-waha.cloud.host.com
WAHA_SESSION=default
WAHA_API_KEY=your-api-key-if-any

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
CRON_SECRET=generate-a-random-32char-string

# Optional: Google Sheets-backed checklist completions
CHECKLIST_SPREADSHEET_ID=your-google-sheet-id
CHECKLIST_COMPLETIONS_SHEET=Checklist Completions
GOOGLE_SHEETS_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

### 5. Create First Admin User

After deploying, run this once via Firebase console → Firestore:

Create document in `users` collection:
```json
{
  "uid": "PASTE_FIREBASE_AUTH_UID_HERE",
  "name": "Admin Name",
  "waNumber": "919876543210",
  "waNumberLast10": "9876543210",
  "role": "admin",
  "department": "Admin",
  "isActive": true,
  "createdAt": "SERVER_TIMESTAMP",
  "updatedAt": "SERVER_TIMESTAMP"
}
```

Or use the API after first auth user is created:
```bash
curl -X POST https://yourdomain.com/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","waNumber":"919876543210","role":"admin","department":"Admin","isActive":true}'
```

### 6. WAHA Webhook

In your WAHA cloud dashboard, set the webhook URL to:
```
https://yourdomain.com/api/webhook
```

Events to subscribe: `message`, `message.any`

### 7. Reminders Cron

**Vercel:** `vercel.json` is already configured — runs daily at 7am UTC.

**Other hosts:** Call `GET /api/reminders` with header `x-cron-secret: YOUR_CRON_SECRET` from any cron service (cron-job.org, EasyCron, etc.)

---

## Install & Run

```bash
npm install
npm run dev
```

Build for production:
```bash
npm run build
npm start
```

Deploy to Vercel:
```bash
vercel --prod
```

---

## WhatsApp Commands

Users can message the connected WAHA number:

| Command | Action |
|---------|--------|
| `ACCEPT T-0001` | Accept assigned task |
| `DONE T-0001` | Mark task complete |
| `VERIFY T-0001` | Verify completed task (checker only) |
| `STATUS` | List your open tasks |
| `REVISE T-0001` | Redirects to portal (revisions done in UI only) |

---

## Task Lifecycle

```
Created → Pending Accept
         ↓ ACCEPT
      In Progress
         ↓ revision requested
   Delay Requested → approved → In Progress (new date)
                   → rejected → In Progress (original date)
         ↓ DONE
      Completed
         ↓ VERIFY
      Verified
```

Overdue is set automatically by the reminders cron when `endDate < now` and status is `Pending Accept` or `In Progress`.

---

## Scores (MIS)

Score = `(onTimeCount / tasksAssigned) * 100`

Updated automatically on:
- Task created → `tasksAssigned++`
- Task completed on time → `tasksCompleted++`, `onTimeCount++`
- Task completed late → `tasksCompleted++`, `lateCount++`

---

## Adding More Departments

Edit `DEPARTMENTS` array in `components/admin/UsersClient.tsx`.

---

## Notes

- Session cookies expire in 7 days
- All score writes are server-side only (admin SDK)
- Logs are append-only — no client can delete or update them
- WAHA webhook always returns 200 to prevent retries
