const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Tuition = require("../models/Tuition");
const Review = require("../models/Review");
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

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fullyDecode(str) {
  let decoded = str || "";
  try {
    while (decoded.includes("%")) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch (_) {}
  return decoded.trim();
}

// GET /api/profile/tutor/:identifier — public tutor profile by email or user _id
router.get("/tutor/:identifier", async (req, res) => {
  try {
    const rawIdentifier = req.params.identifier;
    const identifier = fullyDecode(rawIdentifier);
    let tutor = null;

    if (mongoose.Types.ObjectId.isValid(identifier)) {
      tutor = await User.findById(identifier).select("-__v");
    }

    const escapedId = escapeRegex(identifier);

    if (!tutor) {
      tutor = await User.findOne({
        $or: [
          { email: identifier },
          { email: identifier.toLowerCase() },
          { email: { $regex: new RegExp(`^${escapedId}$`, "i") } },
        ],
      }).select("-__v");
    }

    // If still not found in User, check if any tuition exists under this email
    if (!tutor) {
      const sampleTuition = await Tuition.findOne({
        $or: [
          { tutorEmail: identifier },
          { tutorEmail: identifier.toLowerCase() },
          { tutorEmail: { $regex: new RegExp(`^${escapedId}$`, "i") } },
        ],
      });
      if (sampleTuition) {
        tutor = {
          name: sampleTuition.tutorName,
          email: sampleTuition.tutorEmail,
          role: "tutor",
          plan: "free",
          bio: "Dedicated tutor on MentorLagbe.",
          image: "",
        };
      }
    }

    if (!tutor) {
      return res.status(404).json({ message: "Tutor profile not found" });
    }

    const tutorEmail = tutor.email;
    const escapedEmail = escapeRegex(tutorEmail);

    // Fetch active & approved tuitions
    const tuitions = await Tuition.find({
      $or: [
        { tutorEmail },
        { tutorEmail: tutorEmail.toLowerCase() },
        { tutorEmail: { $regex: new RegExp(`^${escapedEmail}$`, "i") } },
      ],
      approvalStatus: "approved",
      isActive: true,
    }).sort({ createdAt: -1 });

    // Fetch all reviews for this tutor
    const reviews = await Review.find({
      $or: [
        { tutorEmail },
        { tutorEmail: tutorEmail.toLowerCase() },
        { tutorEmail: { $regex: new RegExp(`^${escapedEmail}$`, "i") } },
      ],
    }).sort({ createdAt: -1 });

    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? Number(
            (reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews).toFixed(1)
          )
        : 0;

    const subjects = [...new Set(tuitions.map((t) => t.subject))];

    res.json({
      tutor: {
        _id: tutor._id || null,
        name: tutor.name,
        email: tutor.email,
        image: tutor.image || "",
        bio: tutor.bio || "Passionate educator mentoring students to academic excellence.",
        phone: tutor.phone || "",
        role: tutor.role || "tutor",
        plan: tutor.plan || "free",
        createdAt: tutor.createdAt || null,
      },
      tuitions,
      reviews,
      stats: {
        totalBatches: tuitions.length,
        subjects,
        averageRating,
        totalReviews,
      },
    });
  } catch (error) {
    console.error("GET /api/profile/tutor/:id error:", error);
    res.status(500).json({ message: "Failed to fetch tutor profile" });
  }
});

module.exports = router;
