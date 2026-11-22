// src/routes/reviews.js
const express = require("express");
const Review = require("../models/Review");
const Application = require("../models/Application");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { verifyToken, verifyStudent } = require("../middlewares/auth");

const router = express.Router();

function areSimilarFeedback(textA, textB) {
  const cleanA = (textA || "").toLowerCase().replace(/[^\w\s]/g, "").trim();
  const cleanB = (textB || "").toLowerCase().replace(/[^\w\s]/g, "").trim();
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;
  if (cleanA.slice(0, 25) === cleanB.slice(0, 25)) return true;
  const wordsA = new Set(cleanA.split(/\s+/));
  const wordsB = new Set(cleanB.split(/\s+/));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const overlap = intersection / Math.min(wordsA.size, wordsB.size);
  return overlap >= 0.6;
}

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

// GET /api/reviews/featured — public real testimonials/reviews across the platform
// Guarantees random distinct students and distinct non-repeating feedback across the 6 featured cards
router.get("/featured", async (req, res) => {
  try {
    const candidateReviews = await Review.find({ rating: { $gte: 4 } }).lean();

    // Randomly shuffle candidates on every API call so reviews arrive randomly
    const shuffled = candidateReviews.sort(() => Math.random() - 0.5);

    const featured = [];
    const seenStudents = new Set();
    const seenFeedbacks = [];

    // Pass 1: Strict distinct student AND distinct non-repeating feedback
    for (const r of shuffled) {
      const studentKey = (r.studentEmail || r.studentName || "").toLowerCase().trim();
      if (!studentKey || seenStudents.has(studentKey)) continue;

      const isDuplicateFeedback = seenFeedbacks.some((fb) =>
        areSimilarFeedback(fb, r.feedback)
      );
      if (isDuplicateFeedback) continue;

      seenStudents.add(studentKey);
      seenFeedbacks.push(r.feedback);
      featured.push(r);
      if (featured.length >= 6) break;
    }

    // Pass 2: If fewer than 6, fill with unique students
    if (featured.length < 6) {
      for (const r of shuffled) {
        const studentKey = (r.studentEmail || r.studentName || "").toLowerCase().trim();
        if (studentKey && !seenStudents.has(studentKey)) {
          seenStudents.add(studentKey);
          featured.push(r);
          if (featured.length >= 6) break;
        }
      }
    }

    res.json(featured);
  } catch (error) {
    console.error("GET /api/reviews/featured error:", error);
    res.status(500).json({ message: "Failed to fetch featured reviews", reviews: [] });
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
    const studentEmailRegex = { $regex: new RegExp(`^${(req.user.email || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };

    const application = await Application.findOne({
      tuitionId: req.params.tuitionId,
      studentEmail: studentEmailRegex,
      status: "accepted",
    });

    if (!application) {
      return res.json({ canReview: false, existingReview: null });
    }

    const existingReview = await Review.findOne({
      tuitionId: req.params.tuitionId,
      studentEmail: studentEmailRegex,
    });

    res.json({ canReview: true, existingReview });
  } catch (error) {
    res.status(500).json({ message: "Failed to verify review status" });
  }
});

module.exports = router;
