const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Tuition = require("../models/Tuition");
const Review = require("../models/Review");
const Application = require("../models/Application");
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
    const { name, phone, bio, image, availability } = req.body;
    const updateData = {};
    if (typeof name === "string" && name.trim()) updateData.name = name.trim();
    if (typeof phone === "string") updateData.phone = phone.trim();
    if (typeof bio === "string") updateData.bio = bio.trim();
    if (typeof image === "string") updateData.image = image.trim();
    if (Array.isArray(availability)) updateData.availability = availability;

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

    // Dynamic response time calculation
    const respondedApps = await Application.find({
      $or: [
        { tutorEmail },
        { tutorEmail: tutorEmail.toLowerCase() },
        { tutorEmail: { $regex: new RegExp(`^${escapedEmail}$`, "i") } },
      ],
      status: { $in: ["accepted", "rejected"] },
    });

    let responseTime = "~1 hr";
    let responseBadge = "Fast Responder (~1 hr)";

    if (respondedApps.length > 0) {
      const validDiffs = respondedApps
        .map((a) => {
          const startDate = a.appliedAt || (a.createdAt ? new Date(a.createdAt) : null) || (a._id ? a._id.getTimestamp() : null);
          const endDate = a.decidedAt || a.updatedAt || a.appliedAt;
          if (!startDate || !endDate) return null;
          const start = new Date(startDate).getTime();
          const end = new Date(endDate).getTime();
          if (isNaN(start) || isNaN(end)) return null;
          return Math.max(0, end - start);
        })
        .filter((d) => d !== null);

      const totalDiffMs = validDiffs.reduce((sum, d) => sum + d, 0);
      const avgMinutes = validDiffs.length > 0 ? Math.round(totalDiffMs / (validDiffs.length * 60 * 1000)) : NaN;

      if (isNaN(avgMinutes) || !isFinite(avgMinutes)) {
        responseTime = "~1 hr";
        responseBadge = "Fast Responder (~1 hr)";
      } else if (avgMinutes <= 30) {
        responseTime = "~15 min";
        responseBadge = "Lightning Fast (⚡ ~15m)";
      } else if (avgMinutes <= 90) {
        responseTime = "~1 hr";
        responseBadge = "Fast Responder (~1 hr)";
      } else if (avgMinutes <= 180) {
        responseTime = "~2 hrs";
        responseBadge = "Responsive (~2 hrs)";
      } else if (avgMinutes <= 360) {
        responseTime = "~4 hrs";
        responseBadge = "Responsive (~4 hrs)";
      } else if (avgMinutes <= 1440) {
        responseTime = "Within 24 hrs";
        responseBadge = "Replies within a day";
      } else {
        const days = Math.max(1, Math.round(avgMinutes / 1440));
        responseTime = `Within ${days}d`;
        responseBadge = `Replies in ${days} days`;
      }
    } else {
      responseTime = tutor.plan === "pro" ? "~30 min" : "~1 hr";
      responseBadge = tutor.plan === "pro" ? "Priority Tutor (⚡ ~30m)" : "Fast Responder (~1 hr)";
    }

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
        availability: tutor.availability || [],
        responseTime,
        responseBadge,
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
