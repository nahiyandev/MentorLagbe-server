# MentorLagbe — Backend API Server

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js%2020+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js%205-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB Atlas](https://img.shields.io/badge/MongoDB_Atlas-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Mongoose](https://img.shields.io/badge/Mongoose%209-880000?style=for-the-badge&logo=mongoose&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens)
![Stripe](https://img.shields.io/badge/Stripe%20SDK-626CD9?style=for-the-badge&logo=stripe&logoColor=white)

**High-performance, role-guarded RESTful API server powering MentorLagbe.**  
Built with Express.js 5, Mongoose 9, and MongoDB Atlas.

[Frontend Live Website](https://mentor-lagbe.vercel.app) • [Backend API Base](https://mentor-lagbe-server.vercel.app) • [Frontend Repo](https://github.com/nahiyandev/MentorLagbe)

</div>

---

## 📌 Features & Architectural Highlights

- **Role-Based Middlewares (RBAC)**: `verifyToken`, `verifyStudent`, `verifyTutor`, `verifyAdmin` guaranteeing strict boundary isolation.
- **Aggregation Pipelines**: Real-time batch capacity computation (`seatLimit`, `enrolledCount`, `remainingSeats`, `isFull`) without duplicate queries.
- **Dynamic Tutor Analytics**: Automated response time computation based on historical applicant review latency (`~15 min`, `~1 hr`, `~2 hrs`).
- **Cryptographic Webhooks**: Stripe webhook handling via `express.raw` for signature authenticity verification.
- **Multi-Channel Payout Pipeline**: Complete withdrawal system supporting bKash, Nagad, and Bank transfer.
- **Class Attendance & Slot Engine**: Real class marking (`+1 Done` / `-1 Undo`), double-booking prevention, and Google Meet distribution.

---

## 🔗 Live Base URL

- **Production API:** `https://mentor-lagbe-server.vercel.app`
- **Health Endpoint:** `https://mentor-lagbe-server.vercel.app/api/health`

---

## 🔑 Role Accounts & Credentials

| Role | Email | Password | Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `nahiyanadmin@gmail.com` | `12345678` | System moderation, payouts, user roles, financial ledger |
| **Tutor** | `nahiyan@gmail.com` | `12345678` | Batch creation, applicant review, attendance, payout requests |
| **Student** | `fahim@gmail.com` | `12345678` | Discovery, applications, payments, meet links, reviews |

---

## 📡 Complete REST API Endpoint Directory

### 1. Health & Discovery
- `GET /` — Server status message
- `GET /api/health` — Microservice health probe (`{"status":"ok"}`)
- `GET /api/tuitions` — Public approved & active listings. Filters: `?search=`, `?subject=`, `?classLevel=`, `?mode=`, `?district=`, `?minFee=`, `?maxFee=`, `?sort=`
- `GET /api/tuitions/:id` — Single tuition details with booked slots, remaining seats, and tutor details

### 2. Authentication & JWT Exchange
- `POST /api/auth/jwt` — Exchanges client BetterAuth session for backend signed JWT containing `id`, `email`, and `role`

### 3. Tutors & Batches
- `GET /api/tuitions/my-tuitions` — Tutor's batches with live `enrolledCount` & `remainingSeats`
- `POST /api/tuitions` — Create tuition batch (capped at 2 for Free plan, unlimited for Pro)
- `PUT /api/tuitions/:id` — Update batch details (title, subject, fee, schedule, seatLimit)
- `PATCH /api/tuitions/:id/toggle` — Toggle Active / Closed status
- `DELETE /api/tuitions/:id` — Remove owned batch
- `GET /api/tuitions/tutor/analytics` — Views, applicant counts, and revenue statistics
- `GET /api/applications/tutor` — Incoming student applications
- `PATCH /api/applications/:id/status` — Accept or reject an application (with batch-full guard)
- `PATCH /api/applications/:id/attendance` — Increment (`+1`) or decrement (`-1 Undo`) completed class attendance
- `PATCH /api/applications/:id/meet-link` — Assign or update Google Meet class link

### 4. Students & Applications
- `POST /api/applications` — Apply for a tuition (checks duplicate applications and seat full status)
- `GET /api/applications/my-applications` — Student's application history with meet links & attendance
- `DELETE /api/applications/:id` — Cancel pending application
- `GET /api/payments/my-payments` — Student's personal transaction history (Stripe + bKash/Nagad)

### 5. Payouts & Withdrawals
- `POST /api/payouts` — Tutor submits withdrawal request (bKash, Nagad, or Bank)
- `GET /api/payouts/my-requests` — Tutor's payout request history
- `GET /api/payouts/admin` — Admin view of all pending and processed payout requests
- `PATCH /api/payouts/:id` — Admin approve or reject payout with transaction reference note

### 6. Profiles & Availability
- `GET /api/profile` — Logged-in user's full profile
- `PATCH /api/profile` — Update editable fields (`name`, `phone`, `bio`, `image`, `availability`)
- `GET /api/profile/tutor/:identifier` — Public tutor profile with active batches, reviews, and dynamic response speed

### 7. Reviews & Ratings
- `GET /api/reviews/featured` — Randomized public testimonials from verified students
- `GET /api/reviews/tuition/:tuitionId` — All reviews for a specific tuition batch
- `GET /api/reviews/can-review/:tuitionId` — Checks student eligibility to leave review
- `POST /api/reviews` — Submit verified review (students of accepted applications only)

### 8. Stripe Payments & Pro Subscriptions
- `POST /api/payments/checkout` — Generate Stripe Checkout Session (Tutor Pro $15, Student Pro $10)
- `GET /api/payments/verify-session` — Verify Stripe checkout return and upgrade plan to `pro`
- `POST /api/payments/webhook` — Stripe webhook listener validating signatures and recording transactions

### 9. Administration
- `GET /api/admin/stats` — Platform counters (Users, Tutors, Pending Batches, Stripe Revenue)
- `GET /api/admin/users` — User list with role filtering
- `PATCH /api/admin/users/:id/role` — Update user permissions (`student` | `tutor` | `admin`)
- `GET /api/admin/tuitions` — Admin moderation queue
- `PATCH /api/admin/tuitions/:id/approve` — Approve tuition for public listing
- `PATCH /api/admin/tuitions/:id/reject` — Reject tuition with feedback
- `GET /api/admin/transactions` — Platform-wide payment records

### 10. Messages, Bookmarks & Reports
- `GET /api/messages` & `POST /api/messages` — In-app messaging for inquiries & admin support
- `GET /api/bookmarks` & `POST /api/bookmarks/toggle` — Save/unsave tuitions
- `POST /api/reports` — Report inaccurate or inappropriate tuition listings

---

## 💻 Local Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure .env
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLIENT_URL=http://localhost:3000

# 3. Start server
npm run dev
```
