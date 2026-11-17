// MentorLagbe server — entry point

require("dotenv").config(); 
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();
const tuitionsRoutes = require("./routes/tuitions");


// CORS: শুধু আমাদের client (Next.js) যেন API-তে কথা বলতে পারে
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);
// JSON body পড়ার জন্য (POST request-এর data)
app.use(express.json());

// Health check — server বেঁচে আছে কিনা দেখার route
app.get("/", (req, res) => {
  res.json({ message: "MentorLagbe server is running" });
});


app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/tuitions", tuitionsRoutes);


// 404 — কোনো route না মিললে
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;

// আগে DB connect, তারপর server চালু — DB ছাড়া server চালিয়ে লাভ নেই
connectDB().then(() => {
  // Vercel-এ (serverless) app.listen চলবে না — Vercel নিজে app-টা চালায়
  if (!process.env.VERCEL) {
    app.listen(PORT, () => {
      console.log(`MentorLagbe server running on port ${PORT}`);
    });
  }
});

// Vercel-এর জন্য app export — api/index.js এটা ধরে
module.exports = app;

