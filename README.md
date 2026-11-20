# MentorLagbe — Backend API Server

MentorLagbe is a Smart Tuition & Mentorship Platform (Programming Hero Batch 14, Assignment 9). This is the Express.js + MongoDB backend powering role-based JWT auth, tuition listings, student applications, profile management, and Stripe subscription payments.

---

## Live Links

- **Backend API Base URL:** [https://mentor-lagbe-server.vercel.app](https://mentor-lagbe-server.vercel.app)
- **Frontend Live Website:** [https://mentor-lagbe.vercel.app](https://mentor-lagbe.vercel.app)
- **Frontend Repository:** [https://github.com/nahiyandev/MentorLagbe](https://github.com/nahiyandev/MentorLagbe)

---

## Admin & Test Credentials

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `nahiyanadmin@gmail.com` | `12345678` | User roles, Tuition approval queue, Stripe transaction ledger, platform metrics |
| **Tutor** | `nahiyan@gmail.com` | `12345678` | Post tuitions, CRUD on created batches, applicant accept/reject, Pro upgrade |
| **Student** | `fahim@gmail.com` | `12345678` | Browse & apply for tuitions, track application status, cancel pending requests |

---

## Tech Stack

- **Runtime & Framework:** Node.js, Express.js (v5)
- **Database & ODM:** MongoDB Atlas, Mongoose (v9)
- **Authentication:** JSON Web Tokens (`jsonwebtoken`), role-based middlewares (`verifyToken`, `verifyStudent`, `verifyTutor`, `verifyAdmin`)
- **Payments:** Stripe SDK (Checkout Sessions, Dynamic Payment Methods, Webhooks)
- **Utilities:** CORS (whitelisted production & localhost domains), dotenv

---

## API Routes & Endpoints

### 1. Health & Discovery
- `GET /api/health` — Status check (`{"status":"ok"}`)
- `GET /api/tuitions` — Public catalog (approved + active only). Query params: `?search=`, `?subject=`, `?classLevel=`, `?mode=`
- `GET /api/tuitions/:id` — Public single tuition details

### 2. Authentication
- `POST /api/auth/jwt` — Exchanges BetterAuth session token for server JWT signed with user role & ID

### 3. Tutors
- `GET /api/tuitions/my-tuitions` — Tutor's own tuition posts (pending, approved, rejected)
- `POST /api/tuitions` — Create tuition post (free limit: 2 posts; Pro: unlimited)
- `PUT /api/tuitions/:id` — Edit owned tuition listing
- `PATCH /api/tuitions/:id/toggle` — Toggle Active / Closed availability
- `DELETE /api/tuitions/:id` — Delete owned tuition listing
- `GET /api/applications/tutor` — Incoming student applications for tutor's tuitions
- `PATCH /api/applications/:id/status` — Accept or reject an application (`accepted` | `rejected`)

### 4. Students
- `POST /api/applications` — Submit application for an approved tuition (duplicate blocked)
- `GET /api/applications/my-applications` — Student's submitted applications
- `DELETE /api/applications/:id` — Cancel a pending application

### 5. Profile
- `GET /api/profile` — Fetch logged-in user profile (including role, plan, phone, bio, createdAt)
- `PATCH /api/profile` — Update allowed fields (`name`, `phone`, `bio`, `image`)

### 6. Stripe Payments & Pro Subscriptions
- `POST /api/payments/checkout` — Creates Stripe Checkout session for Pro upgrades (Tutor Pro $15, Student Pro $10)
- `GET /api/payments/verify-session` — Verifies Stripe session and updates user to `pro`
- `POST /api/payments/webhook` — Stripe Webhook handler (`checkout.session.completed`) recording to `payments` collection

### 7. Administration
- `GET /api/admin/stats` — Platform metrics (users, tutors, pending/approved tuitions, total Stripe revenue)
- `GET /api/admin/users` — List all users
- `PATCH /api/admin/users/:id/role` — Update user role (`student` | `tutor` | `admin`)
- `GET /api/admin/tuitions` — All tuition submissions (moderation queue)
- `PATCH /api/admin/tuitions/:id/approve` — Approve tuition
- `PATCH /api/admin/tuitions/:id/reject` — Reject tuition
- `GET /api/admin/transactions` — All payment records from `payments` collection

---

## Run Locally

```bash
npm install
npm run dev
```
