// MentorLagbe server — entry point

require("dotenv").config(); 
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();
const tuitionsRoutes = require("./routes/tuitions");
const applicationsRoutes = require("./routes/applications");
const adminRoutes = require("./routes/admin");
const authRoutes = require("./routes/auth");




// CORS: Client (Next.js) localhost and production domains
const allowedOrigins = [
  "https://mentor-lagbe.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
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
app.use("/api/applications", applicationsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);




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

