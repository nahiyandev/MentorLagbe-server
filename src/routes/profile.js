const express = require("express");
const User = require("../models/User");
const { verifyToken } = require("../middlewares/auth");

const router = express.Router();

// GET /api/profile — fetch logged-in user's full profile
router.get("/", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email }).select("-__v");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("GET /api/profile error:", error);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

// PATCH /api/profile — update name, phone, bio, image
// Strictly ignores and disallows email, role, and plan updates
router.patch("/", verifyToken, async (req, res) => {
  try {
    const { name, phone, bio, image } = req.body;
    const updateData = {};
    if (typeof name === "string" && name.trim()) updateData.name = name.trim();
    if (typeof phone === "string") updateData.phone = phone.trim();
    if (typeof bio === "string") updateData.bio = bio.trim();
    if (typeof image === "string") updateData.image = image.trim();

    const user = await User.findOneAndUpdate(
      { email: req.user.email },
      { $set: updateData },
      { new: true }
    ).select("-__v");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("PATCH /api/profile error:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

module.exports = router;
