// src/routes/auth.js
// BetterAuth session token দিয়ে server JWT নেওয়া
// POST /api/auth/jwt — Body: { sessionToken }
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

const router = express.Router();

router.post("/jwt", async (req, res) => {
  try {
    const { sessionToken } = req.body;
    if (!sessionToken) {
      return res.status(400).json({ message: "Session token is required" });
    }

    // BetterAuth-এর session collection-এ token খোঁজা
const Session = mongoose.models.Session || mongoose.model(
  "Session",
  new mongoose.Schema({}, { strict: false }),
  "session"
);
const session = await Session.findOne({ token: sessionToken }).lean();
    if (!session) {
      return res.status(401).json({ message: "Invalid session" });
    }
    if (new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ message: "Session expired" });
    }

    // session-এর userId দিয়ে users collection থেকে user নেওয়া
    const user = await User.findById(session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // JWT sign — payload: id, email, role (verifyToken এটাই পড়ে)
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Failed to issue token" });
  }
});

module.exports = router;
