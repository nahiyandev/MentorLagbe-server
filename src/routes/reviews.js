// src/routes/reviews.js
const express = require("express");
const Review = require("../models/Review");
const Application = require("../models/Application");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { verifyToken, verifyStudent } = require("../middlewares/auth");

const router = express.Router();

// POST /api/reviews — student only (must have an accepted application)
router.post("/", verifyToken, verifyStudent, async (req, res) => {
  try {
    const { tuitionId, rating, feedback } = req.body;
    const numRating = Number(rating);

    if (!tuitionId || !numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({ message: "Valid tuitionId and rating (1-5) are required" });
    }

    if (!feedback || !feedback.trim()) {
      return res.status(400).json({ message: "Feedback comment is required" });
    }

    // Verify student has an ACCEPTED application for this tuition
    const application = await Application.findOne({
      tuitionId,
      studentEmail: req.user.email,
      status: "accepted",
    });

    if (!application) {
      return res.status(403).json({
        message: "Only students with an accepted application can submit a review for this tuition.",
      });
    }

    const studentUser = await User.findOne({ email: req.user.email });

    const review = await Review.findOneAndUpdate(
      { tuitionId, studentEmail: req.user.email },
      {
        $set: {
          tuitionTitle: application.tuitionTitle,
          tutorEmail: application.tutorEmail,
          studentName: studentUser?.name || "Student",
          studentImage: studentUser?.image || "",
          rating: numRating,
          feedback: feedback.trim(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Notify tutor about new review
    try {
      await Notification.create({
        recipientEmail: application.tutorEmail,
        recipientRole: "tutor",
        title: "New Student Review ⭐",
        message: `${studentUser?.name || "Student"} gave a ${numRating}★ review for "${application.tuitionTitle}": "${feedback.trim().slice(0, 60)}..."`,
        type: "system",
        link: `/tuitions/${tuitionId}`,
      });
    } catch (notifErr) {
      console.warn("Could not create review notification:", notifErr);
    }

    res.status(201).json(review);
  } catch (error) {
    console.error("POST /api/reviews error:", error);
    res.status(500).json({ message: error.message || "Failed to submit review" });
  }
});

// GET /api/reviews/tuition/:tuitionId — public reviews for a tuition
router.get("/tuition/:tuitionId", async (req, res) => {
  try {
    const reviews = await Review.find({ tuitionId: req.params.tuitionId }).sort({ createdAt: -1 });
    const count = reviews.length;
    const averageRating =
      count > 0
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(1))
        : 0;

    res.json({ reviews, averageRating, totalReviews: count });
  } catch (error) {
    console.error("GET /api/reviews/tuition/:id error:", error);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
});

// GET /api/reviews/tutor/:tutorEmail — public reviews for a tutor across all tuitions
router.get("/tutor/:tutorEmail", async (req, res) => {
  try {
    const reviews = await Review.find({ tutorEmail: req.params.tutorEmail }).sort({ createdAt: -1 });
    const count = reviews.length;
    const averageRating =
      count > 0
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(1))
        : 0;

    res.json({ reviews, averageRating, totalReviews: count });
  } catch (error) {
    console.error("GET /api/reviews/tutor/:email error:", error);
    res.status(500).json({ message: "Failed to fetch tutor reviews" });
  }
});

// GET /api/reviews/can-review/:tuitionId — check if current student is eligible to review
router.get("/can-review/:tuitionId", verifyToken, async (req, res) => {
  try {
    const application = await Application.findOne({
      tuitionId: req.params.tuitionId,
      studentEmail: req.user.email,
      status: "accepted",
    });

    if (!application) {
      return res.json({ canReview: false, existingReview: null });
    }

    const existingReview = await Review.findOne({
      tuitionId: req.params.tuitionId,
      studentEmail: req.user.email,
    });

    res.json({ canReview: true, existingReview });
  } catch (error) {
    res.status(500).json({ message: "Failed to verify review status" });
  }
});

module.exports = router;
