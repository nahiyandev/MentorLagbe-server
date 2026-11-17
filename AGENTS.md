# AGENTS.md — MentorLagbe Server

Guide for AI coding agents (and humans) working in this repo. Read this before changing code.

## Project

MentorLagbe — Smart Tuition & Mentorship Platform. Programming Hero Batch 14, Assignment 9. Express.js + MongoDB backend.

- Live server: https://mentor-lagbe-server.vercel.app/
- Client repo: TBD (MentorLagbe-client, Next.js)
- Assignment doc is authoritative — follow it literally, never the instruction video's demo design.

## Tech Stack

- Node.js v24, Express.js 5 (CommonJS — `require`, not `import`)
- MongoDB Atlas + Mongoose 9
- JWT (jsonwebtoken) for role-based auth
- Stripe (Checkout + Webhooks), ImgBB (image upload)
- dotenv, cors, nodemon (dev)

## Run Locally

```bash
npm install
cp .env.example .env   # fill real values, never commit .env
npm run dev            # nodemon src/index.js

Server runs on http://localhost:5000. Health: GET /api/health.

Structure


.
├── index.js            # Vercel entry — re-exports src/index.js (do NOT delete)
├── src/
│   ├── index.js        # Express app: CORS, JSON, routes, 404, DB-then-listen
│   ├── config/db.js    # Mongoose connect (exits if DB fails)
│   ├── models/         # User, Tuition, Application, Payment (doc fields exactly)
│   └── middlewares/auth.js  # verifyToken, verifyStudent, verifyTutor, verifyAdmin
├── .env.example        # placeholders only, no real secrets
└── README.md
Rules
All API routes use the /api prefix (e.g. /api/health, /api/tuitions).
Exactly 4 collections: users, tuitions, applications, payments — fields match the assignment doc exactly.
Roles: student, tutor, admin. Free tutors max 2 tuition posts; Pro unlimited.
JWT_SECRET and BETTER_AUTH_SECRET share one value (BetterAuth signs, Express verifies).
Stripe webhook is the ONLY creator of Payment documents — never from the frontend.
Never put secrets in code or git. .env is git-ignored.
Deploy (Vercel)
Root index.js is the serverless entry (BookNook-servar pattern). Do NOT add an api/ directory or vercel.json — Vercel reserves /api/* for its own function files and shadows Express routes.
src/index.js guards app.listen with if (!process.env.VERCEL) and exports the app.
Env vars must be set in the Vercel dashboard (MONGODB_URI, JWT_SECRET, BETTER_AUTH_SECRET, STRIPE_*, IMGBB_API_KEY).
Push to main auto-deploys.
Workflow
One meaningful commit per file/feature with a descriptive message.
Explain every line in Bangla to the owner; he types the code himself.