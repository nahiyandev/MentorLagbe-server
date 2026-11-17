# MentorLagbe — Server

MentorLagbe is a Smart Tuition & Mentorship Platform (Programming Hero Batch 14, Assignment 9). This is the Express.js + MongoDB backend: role-based JWT auth, tuitions, applications, and Stripe payments.

## Live Links

- Server: TBD (deploy pending)
- Client: TBD
- Live Website: TBD

## Admin Credentials (for testing)

- Admin Email: TBD
- Admin Password: TBD

## Tech Stack

- Node.js, Express.js
- MongoDB + Mongoose
- JSON Web Token (role-based auth)
- Stripe (Checkout + Webhooks)
- ImgBB (image upload)
- CORS, dotenv

## Features

- JWT authentication with role-based middlewares (verifyToken, verifyStudent, verifyTutor, verifyAdmin)
- 4 MongoDB collections: users, tuitions, applications, payments
- Tutor posts tuitions (free plan max 2, Pro unlimited); Admin approves/rejects
- Student applies to tuitions; Tutor accepts/rejects applications
- Stripe Pro subscription: Tutor $15, Student $10 (webhook syncs plan to 'pro')
- Server-side search & filter on tuitions
- ImgBB direct image upload

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev
