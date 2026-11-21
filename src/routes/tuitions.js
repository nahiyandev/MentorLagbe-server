
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Tuition = require("../models/Tuition");
const User = require("../models/User");
const Review = require("../models/Review");
const Application = require("../models/Application");
const { verifyToken, verifyTutor } = require("../middlewares/auth");

const router = express.Router();

// GET /api/tuitions/stats — platform-wide real dynamic statistics
router.get("/stats", async (req, res) => {
  try {
    const totalTuitions = await Tuition.countDocuments({
      approvalStatus: "approved",
      isActive: true,
    });
    const subjects = await Tuition.distinct("subject", {
      approvalStatus: "approved",
      isActive: true,
    });
    const totalReviews = await Review.countDocuments();
    const avgAgg = await Review.aggregate([
      { $group: { _id: null, avg: { $avg: "$rating" } } },
    ]);
    const averageRating =
      avgAgg.length > 0 && typeof avgAgg[0].avg === "number"
        ? Number(avgAgg[0].avg.toFixed(1))
        : 0;

    res.json({
      totalTuitions,
      subjectsCount: subjects.length,
      totalReviews,
      averageRating,
      verifiedTutorsPercentage: 100,
    });
  } catch (error) {
    console.error("GET /api/tuitions/stats error:", error);
    res.status(500).json({ message: "Failed to fetch platform stats" });
  }
});

// GET /api/tuitions — public (শুধু approved + active)
// ?search= (title/subject/location), ?subject=, ?classLevel=, ?mode=, ?minFee=, ?maxFee=, ?district=
router.get("/", async (req, res) => {
  try {
    const { search, subject, classLevel, mode, minFee, maxFee, district, sort } = req.query;

    const filter = { approvalStatus: "approved", isActive: true };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }
    if (subject) filter.subject = subject;
    if (classLevel) filter.classLevel = classLevel;
    if (mode) filter.mode = mode;

    if (district && district.trim()) {
      filter.location = { $regex: district.trim(), $options: "i" };
    }

    if (minFee || maxFee) {
      filter.monthlyFee = {};
      if (minFee && !isNaN(Number(minFee))) {
        filter.monthlyFee.$gte = Number(minFee);
      }
      if (maxFee && !isNaN(Number(maxFee))) {
        filter.monthlyFee.$lte = Number(maxFee);
      }
    }

    let sortOption = { createdAt: -1 };
    if (sort === "fee_asc") sortOption = { monthlyFee: 1 };
    if (sort === "fee_desc") sortOption = { monthlyFee: -1 };
    if (sort === "oldest") sortOption = { createdAt: 1 };

    const tuitions = await Tuition.find(filter).sort(sortOption).lean();

    // Attach real dynamic ratings aggregated from Review collection
    const tuitionIds = tuitions.map((t) => t._id);
    const reviewAgg = await Review.aggregate([
      { $match: { tuitionId: { $in: tuitionIds } } },
      {
        $group: {
          _id: "$tuitionId",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    const ratingMap = {};
    reviewAgg.forEach((r) => {
      ratingMap[r._id.toString()] = {
        averageRating: Number(r.averageRating.toFixed(1)),
        totalReviews: r.totalReviews,
      };
    });

    let enriched = tuitions.map((t) => ({
      ...t,
      averageRating: ratingMap[t._id.toString()]?.averageRating || 0,
      totalReviews: ratingMap[t._id.toString()]?.totalReviews || 0,
    }));

    if (sort === "rating_desc") {
      enriched = enriched.sort((a, b) => b.averageRating - a.averageRating);
    } else if (sort === "rating_asc") {
      enriched = enriched.sort((a, b) => a.averageRating - b.averageRating);
    }

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tuitions" });
  }
});

// GET /api/tuitions/my-tuitions — tutor-এর নিজের সব টিউশন (pending সহ)
// NOTE: এটা /:id-এর আগে থাকতে হবে, নাহলে "my-tuitions"-কে id ধরে নেবে
router.get("/my-tuitions", verifyToken, verifyTutor, async (req, res) => {
  try {
    const tuitions = await Tuition.find({ tutorEmail: req.user.email }).sort({ createdAt: -1 });
    res.json(tuitions);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch your tuitions" });
  }
});

// GET /api/tuitions/tutor/analytics — tutor listing views & application analytics
router.get("/tutor/analytics", verifyToken, verifyTutor, async (req, res) => {
  try {
    const email = req.user.email;
    const myTuitions = await Tuition.find({
      $or: [
        { tutorEmail: email },
        { tutorEmail: email.toLowerCase() },
      ],
    }).sort({ createdAt: -1 });

    let totalViews = 0;
    let totalApplicants = 0;
    let totalAccepted = 0;

    const breakdown = await Promise.all(
      myTuitions.map(async (t) => {
        const views = t.viewCount || 0;
        const applicantsCount = await Application.countDocuments({ tuitionId: t._id });
        const acceptedCount = await Application.countDocuments({
          tuitionId: t._id,
          status: "accepted",
        });

        totalViews += views;
        totalApplicants += applicantsCount;
        totalAccepted += acceptedCount;

        const conversionRate =
          views > 0 ? Number(((applicantsCount / views) * 100).toFixed(1)) : 0;

        return {
          tuitionId: t._id,
          title: t.title,
          subject: t.subject,
          monthlyFee: t.monthlyFee,
          mode: t.mode,
          approvalStatus: t.approvalStatus,
          isActive: t.isActive,
          views,
          applicantsCount,
          acceptedCount,
          conversionRate,
        };
      })
    );

    const overallConversionRate =
      totalViews > 0
        ? Number(((totalApplicants / totalViews) * 100).toFixed(1))
        : 0;

    return res.json({
      totals: {
        totalListings: myTuitions.length,
        totalViews,
        totalApplicants,
        totalAccepted,
        overallConversionRate,
      },
      breakdown,
    });
  } catch (error) {
    console.error("Error in tutor analytics:", error);
    return res.status(500).json({ message: "Failed to fetch tutor analytics" });
  }
});

// GET /api/tuitions/:id — public details (approved + active, or owner/admin preview)
router.get("/:id", async (req, res) => {
  try {
    const tuition = await Tuition.findById(req.params.id);
    if (!tuition) return res.status(404).json({ message: "Tuition not found" });

    const attachRating = async (doc) => {
      const reviewAgg = await Review.aggregate([
        { $match: { tuitionId: doc._id } },
        {
          $group: {
            _id: "$tuitionId",
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ]);
      const data = reviewAgg[0] || { averageRating: 0, totalReviews: 0 };
      const obj = doc.toObject ? doc.toObject() : doc;
      obj.averageRating = Number((data.averageRating || 0).toFixed(1));
      obj.totalReviews = data.totalReviews || 0;
      try {
        const tutorUser = await User.findOne({ email: doc.tutorEmail }).select("availability");
        obj.tutorAvailability = tutorUser?.availability || [];
      } catch (_) {
        obj.tutorAvailability = [];
      }
      return obj;
    };

    // Public view: approved & active
    if (tuition.approvalStatus === "approved" && tuition.isActive) {
      Tuition.findByIdAndUpdate(tuition._id, { $inc: { viewCount: 1 } }).catch(() => {});
      const enriched = await attachRating(tuition);
      return res.json(enriched);
    }

    // Owner or admin preview
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.email === tuition.tutorEmail || decoded.role === "admin") {
          const enriched = await attachRating(tuition);
          return res.json(enriched);
        }
      } catch (_) {
        const Session =
          mongoose.models.Session ||
          mongoose.model(
            "Session",
            new mongoose.Schema({}, { strict: false }),
            "session"
          );
        const session = await Session.findOne({ token }).lean();
        if (session && new Date(session.expiresAt) >= new Date()) {
          const user = await User.findById(session.userId);
          if (
            user &&
            (user.email === tuition.tutorEmail || user.role === "admin")
          ) {
            const enriched = await attachRating(tuition);
            return res.json(enriched);
          }
        }
      }
    }

    return res.status(404).json({ message: "Tuition not found" });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tuition" });
  }
});

// POST /api/tuitions — tutor only
// Free plan: max 2 টিউশন; Pro: unlimited (plan User collection থেকে দেখে)
router.post("/", verifyToken, verifyTutor, async (req, res) => {
  try {
    const { title, subject, classLevel, mode, location, monthlyFee, daysPerWeek, bannerImage, description, tutorName } = req.body;

    if (!title || !subject || !classLevel || !mode || !monthlyFee) {
      return res.status(400).json({ message: "Title, subject, class level, mode and monthly fee are required" });
    }

    const user = await User.findOne({ email: req.user.email });
    const plan = user?.plan || "free"; // user না পেলে free ধরা হয় (doc-এর default)
    const count = await Tuition.countDocuments({ tutorEmail: req.user.email });
    if (plan === "free" && count >= 2) {
      return res.status(403).json({ message: "Free plan allows max 2 tuitions. Upgrade to Pro for unlimited posts." });
    }

    const tuition = await Tuition.create({
      title, subject, classLevel, mode, location, monthlyFee,
      daysPerWeek, bannerImage, description,
      tutorName: tutorName || user?.name || "Tutor",
      tutorEmail: req.user.email,
      approvalStatus: "pending", // admin approve না করা পর্যন্ত public-এ দেখাবে না
      isActive: true,
    });
    res.status(201).json(tuition);
  } catch (error) {
    console.error("Failed to create tuition:", error);
    res.status(500).json({ message: error.message || "Failed to create tuition" });
  }
});

// PUT /api/tuitions/:id — tutor only, নিজের টিউশনই edit করতে পারবে
router.put("/:id", verifyToken, verifyTutor, async (req, res) => {
  try {
    const tuition = await Tuition.findOne({ _id: req.params.id, tutorEmail: req.user.email });
    if (!tuition) return res.status(404).json({ message: "Tuition not found" });
    const fields = ["title", "subject", "classLevel", "mode", "location", "monthlyFee", "daysPerWeek", "bannerImage", "description"];
    fields.forEach((f) => { if (req.body[f] !== undefined) tuition[f] = req.body[f]; });
    await tuition.save();
    res.json(tuition);
  } catch (error) {
    res.status(500).json({ message: "Failed to update tuition" });
  }
});

// PATCH /api/tuitions/:id/toggle — Active/Closed toggle (tutor only, নিজেরটা)
router.patch("/:id/toggle", verifyToken, verifyTutor, async (req, res) => {
  try {
    const tuition = await Tuition.findOne({ _id: req.params.id, tutorEmail: req.user.email });
    if (!tuition) return res.status(404).json({ message: "Tuition not found" });
    tuition.isActive = !tuition.isActive;
    await tuition.save();
    res.json(tuition);
  } catch (error) {
    res.status(500).json({ message: "Failed to toggle tuition" });
  }
});

// DELETE /api/tuitions/:id — tutor only, নিজের টিউশনই delete করতে পারবে
router.delete("/:id", verifyToken, verifyTutor, async (req, res) => {
  try {
    const tuition = await Tuition.findOneAndDelete({ _id: req.params.id, tutorEmail: req.user.email });
    if (!tuition) return res.status(404).json({ message: "Tuition not found" });
    res.json({ message: "Tuition deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete tuition" });
  }
});

module.exports = router;
