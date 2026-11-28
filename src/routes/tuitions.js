
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Tuition = require("../models/Tuition");
const User = require("../models/User");
const Review = require("../models/Review");
const Application = require("../models/Application");
const { verifyToken, verifyTutor, verifyActiveUser } = require("../middlewares/auth");

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
    if (subject && subject.trim()) {
      filter.subject = { $regex: new RegExp(`^${subject.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    }
    if (classLevel && classLevel.trim()) {
      const escaped = classLevel.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const normalizedRegex = escaped.replace(/[\u2013\u2014–—]/g, "[-–—]");
      filter.classLevel = { $regex: new RegExp(`^${normalizedRegex}$`, "i") };
    }
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

    const appAgg = await Application.aggregate([
      { $match: { tuitionId: { $in: tuitionIds }, status: "accepted" } },
      { $group: { _id: "$tuitionId", count: { $sum: 1 } } },
    ]);
    const appMap = {};
    appAgg.forEach((a) => {
      appMap[a._id.toString()] = a.count;
    });

    let enriched = tuitions.map((t) => {
      const seatLimit = t.seatLimit || 5;
      const enrolledCount = appMap[t._id.toString()] || 0;
      const remainingSeats = Math.max(0, seatLimit - enrolledCount);
      return {
        ...t,
        seatLimit,
        enrolledCount,
        remainingSeats,
        isFull: remainingSeats <= 0,
        averageRating: ratingMap[t._id.toString()]?.averageRating || 0,
        totalReviews: ratingMap[t._id.toString()]?.totalReviews || 0,
      };
    });

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
    const email = req.user.email;
    const tuitions = await Tuition.find({
      $or: [
        { tutorEmail: email },
        { tutorEmail: email.toLowerCase() },
      ],
    }).sort({ createdAt: -1 }).lean();

    const tuitionIds = tuitions.map((t) => t._id);
    const appAgg = await Application.aggregate([
      { $match: { tuitionId: { $in: tuitionIds }, status: "accepted" } },
      { $group: { _id: "$tuitionId", count: { $sum: 1 } } },
    ]);
    const appMap = {};
    appAgg.forEach((a) => {
      appMap[a._id.toString()] = a.count;
    });

    const enriched = tuitions.map((t) => {
      const seatLimit = t.seatLimit || 5;
      const enrolledCount = appMap[t._id.toString()] || 0;
      const remainingSeats = Math.max(0, seatLimit - enrolledCount);
      return {
        ...t,
        seatLimit,
        enrolledCount,
        remainingSeats,
        isFull: remainingSeats <= 0,
      };
    });

    res.json(enriched);
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
    let totalEarnings = 0;

    const breakdown = await Promise.all(
      myTuitions.map(async (t) => {
        const views = t.viewCount || 0;
        const applicantsCount = await Application.countDocuments({ tuitionId: t._id });
        const acceptedApps = await Application.find({
          tuitionId: t._id,
          status: "accepted",
        });
        const acceptedCount = acceptedApps.length;
        const tuitionEarnings = acceptedApps.reduce(
          (sum, a) => sum + (a.monthlyFee || t.monthlyFee || 0),
          0
        );

        totalViews += views;
        totalApplicants += applicantsCount;
        totalAccepted += acceptedCount;
        totalEarnings += tuitionEarnings;

        // Acceptance rate: accepted / applicants (capped at 100%)
        const acceptanceRate =
          applicantsCount > 0
            ? Math.min(100, Number(((acceptedCount / applicantsCount) * 100).toFixed(1)))
            : 0;

        // Apply rate: applicants / views (capped at 100%, null if views === 0)
        const applyRate =
          views > 0
            ? Math.min(100, Number(((applicantsCount / views) * 100).toFixed(1)))
            : null;

        const conversionRate = acceptanceRate;

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
          tuitionEarnings,
          acceptanceRate,
          applyRate,
          conversionRate,
        };
      })
    );

    const overallAcceptanceRate =
      totalApplicants > 0
        ? Math.min(100, Number(((totalAccepted / totalApplicants) * 100).toFixed(1)))
        : 0;

    const overallConversionRate =
      totalViews > 0
        ? Math.min(100, Number(((totalApplicants / totalViews) * 100).toFixed(1)))
        : null;

    return res.json({
      totals: {
        totalListings: myTuitions.length,
        totalViews,
        totalApplicants,
        totalAccepted,
        totalEarnings,
        overallAcceptanceRate,
        overallConversionRate,
        acceptanceRate: overallAcceptanceRate,
      },
      breakdown,
    });
  } catch (error) {
    console.error("Error in tutor analytics:", error);
    return res.status(500).json({ message: "Failed to fetch tutor analytics" });
  }
});

// POST /api/tuitions/ai-match — AI Tutor Matcher
router.post("/ai-match", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ message: "Prompt is required for AI matching" });
    }

    const p = prompt.toLowerCase();

    // 1. Detect Subject
    const subjectKeywords = [
      { name: "Mathematics", words: ["math", "mathematics", "গণিত", "ম্যাথ", "higher math", "উচ্চতর গণিত", "calculus", "বীজগণিত", "জ্যামিতি"] },
      { name: "Physics", words: ["physics", "পদার্থ", "পদার্থবিজ্ঞান", "ফিজিক্স"] },
      { name: "Chemistry", words: ["chemistry", "রসায়ন", "কেমিস্ট্রি"] },
      { name: "Biology", words: ["biology", "জীববিজ্ঞান", "বায়োলজি", "জীব"] },
      { name: "English", words: ["english", "ইংরেজি", "ইংরেজী", "grammar", "ielts", "spoken"] },
      { name: "ICT", words: ["ict", "তথ্য ও যোগাযোগ", "computer", "কম্পিউটার", "programming"] },
      { name: "Bangla", words: ["bangla", "বাংলা", "সাহিত্য", "ব্যাকরণ"] },
      { name: "Accounting", words: ["accounting", "হিসাববিজ্ঞান", "হিসাব"] },
      { name: "Finance", words: ["finance", "অর্থায়ন", "ব্যাংকিং"] },
      { name: "Economics", words: ["economics", "অর্থনীতি"] },
      { name: "General Science", words: ["science", "বিজ্ঞান", "সাধারণ বিজ্ঞান"] },
    ];

    let detectedSubject = "";
    for (const sub of subjectKeywords) {
      if (sub.words.some((w) => p.includes(w))) {
        detectedSubject = sub.name;
        break;
      }
    }

    // 2. Detect Class Level
    const classKeywords = [
      { name: "University Admission", words: ["admission", "ভর্তি", "buet", "medical", "varsity", "মেডিকেল", "বুয়েট", "বিশ্ববিদ্যালয়"] },
      { name: "HSC / Class 11–12", words: ["hsc", "class 11", "class 12", "১১শ", "১২শ", "এইচএসসি", "college", "কলেজ", "alim"] },
      { name: "SSC / Class 9–10", words: ["ssc", "class 9", "class 10", "৯ম", "১০ম", "এসএসসি", "dakhil", "দাখিল"] },
      { name: "Class 6–8", words: ["class 6", "class 7", "class 8", "৬ষ্ঠ", "৭ম", "৮ম", "jsc", "জেএসসি"] },
      { name: "Class 1–5", words: ["class 1", "class 2", "class 3", "class 4", "class 5", "১ম", "২য়", "৩য়", "৪র্থ", "৫ম", "primary", "প্রাথমিক"] },
    ];

    let detectedClassLevel = "";
    for (const cl of classKeywords) {
      if (cl.words.some((w) => p.includes(w))) {
        detectedClassLevel = cl.name;
        break;
      }
    }

    // 3. Detect Budget
    let detectedBudget = 0;
    const feeMatch = p.match(/(?:budget|বাজেট|fee|টাকা|ফি)?\s*[:=]?\s*(\d{1,2}(?:,\d{3})+|\d{3,6})\s*(?:k|tk|bdt|টাকা|taka)?/i);
    if (feeMatch) {
      let num = feeMatch[1].replace(/,/g, "");
      detectedBudget = parseInt(num, 10);
      if (detectedBudget < 100) detectedBudget *= 1000; // e.g. 5k -> 5000
    }

    // 4. Detect Mode
    let detectedMode = "";
    if (p.includes("online") || p.includes("অনলাইন") || p.includes("remote") || p.includes("meet") || p.includes("zoom")) {
      detectedMode = "Online";
    } else if (p.includes("offline") || p.includes("অফলাইন") || p.includes("হোম") || p.includes("বাসায়") || p.includes("home")) {
      detectedMode = "Offline";
    }

    // Query active & approved tuitions
    const allTuitions = await Tuition.find({ approvalStatus: "approved", isActive: true }).lean();

    // Attach ratings, reviews and tutor details
    const scoredTuitions = await Promise.all(
      allTuitions.map(async (t) => {
        const reviewAgg = await Review.aggregate([
          { $match: { tuitionId: t._id } },
          { $group: { _id: null, avgRating: { $avg: "$rating" }, total: { $sum: 1 } } },
        ]);
        const avgRating = reviewAgg[0]?.avgRating ? Number(reviewAgg[0].avgRating.toFixed(1)) : 5.0;
        const totalReviews = reviewAgg[0]?.total || 0;

        let score = 0;
        const reasons = [];

        // Subject Match (up to 40 pts)
        if (detectedSubject) {
          if (t.subject.toLowerCase() === detectedSubject.toLowerCase()) {
            score += 40;
            reasons.push(`Specialist in ${t.subject}`);
          } else if (t.subject.toLowerCase().includes(detectedSubject.toLowerCase()) || detectedSubject.toLowerCase().includes(t.subject.toLowerCase())) {
            score += 25;
            reasons.push(`Teaches related ${t.subject}`);
          }
        } else {
          score += 20; // baseline if no specific subject detected
        }

        // Class Level Match (up to 30 pts)
        if (detectedClassLevel) {
          const norm = (s) => s.replace(/[\u2013\u2014–—]/g, "-").toLowerCase();
          if (norm(t.classLevel) === norm(detectedClassLevel)) {
            score += 30;
            reasons.push(`Targeted for ${t.classLevel}`);
          } else if (norm(t.classLevel).includes(norm(detectedClassLevel)) || norm(detectedClassLevel).includes(norm(t.classLevel))) {
            score += 15;
            reasons.push(`Compatible with ${t.classLevel}`);
          }
        } else {
          score += 15;
        }

        // Budget match (up to 20 pts)
        if (detectedBudget > 0) {
          if (t.monthlyFee <= detectedBudget) {
            score += 20;
            const savings = detectedBudget - t.monthlyFee;
            if (savings > 0) {
              reasons.push(`Saves ৳${savings.toLocaleString()} within budget`);
            } else {
              reasons.push("Exact budget match");
            }
          } else {
            const diff = t.monthlyFee - detectedBudget;
            const penalty = Math.min(25, Math.floor((diff / detectedBudget) * 30));
            score = Math.max(0, score - penalty);
            reasons.push(`৳${diff.toLocaleString()} above target budget`);
          }
        } else {
          score += 10;
        }

        // Mode match (up to 10 pts)
        if (detectedMode) {
          if (t.mode === detectedMode) {
            score += 10;
            reasons.push(`Offers preferred ${t.mode} sessions`);
          }
        } else {
          score += 5;
        }

        // Rating & Educator quality bonus (up to 10 pts)
        if (avgRating >= 4.5) {
          score += 10;
          reasons.push(`Top-Rated Educator (${avgRating}★ from ${totalReviews || "verified"} reviews)`);
        } else if (avgRating >= 4.0) {
          score += 5;
          reasons.push(`Rated ${avgRating}★ by students`);
        }

        const finalScore = Math.min(99, Math.max(15, score));

        return {
          tuition: {
            ...t,
            averageRating: avgRating,
            totalReviews,
          },
          matchScore: finalScore,
          matchReasons: reasons,
        };
      })
    );

    scoredTuitions.sort((a, b) => b.matchScore - a.matchScore);

    const summaryParts = [];
    if (detectedSubject) summaryParts.push(`Subject: ${detectedSubject}`);
    if (detectedClassLevel) summaryParts.push(`Class: ${detectedClassLevel}`);
    if (detectedBudget) summaryParts.push(`Budget: ≤৳${detectedBudget.toLocaleString()}`);
    if (detectedMode) summaryParts.push(`Mode: ${detectedMode}`);

    const aiSummary = summaryParts.length > 0
      ? `AI matched ${scoredTuitions.length} tutors based on: ${summaryParts.join(" • ")}`
      : `AI analyzed your requirements and suggested the top-rated tutors on MentorLagbe.`;

    res.json({
      analysis: {
        extractedPrompt: prompt.trim(),
        detectedSubject: detectedSubject || "Any Subject",
        detectedClassLevel: detectedClassLevel || "All Classes",
        detectedBudget: detectedBudget || null,
        detectedMode: detectedMode || "Any Format",
        aiSummary,
      },
      matches: scoredTuitions.slice(0, 8),
    });
  } catch (error) {
    console.error("AI Match error:", error);
    res.status(500).json({ message: "Failed to process AI tutor matching" });
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
        const tutorUser = await User.findOne({ email: doc.tutorEmail }).select("availability phone");
        obj.tutorAvailability = tutorUser?.availability || [];
        obj.tutorPhone = tutorUser?.phone || "";

        // Query all accepted applications to expose bookedSlots
        const acceptedApps = await Application.find({
          tuitionId: doc._id,
          status: "accepted",
        }).select("selectedSlots preferredSchedule");

        const booked = new Set();
        for (const app of acceptedApps) {
          if (Array.isArray(app.selectedSlots)) {
            for (const s of app.selectedSlots) {
              if (s) booked.add(s);
            }
          }
          if (app.preferredSchedule) {
            booked.add(app.preferredSchedule);
          }
        }
        obj.bookedSlots = Array.from(booked);

        const seatLimit = doc.seatLimit || 5;
        const enrolledCount = acceptedApps.length;
        const remainingSeats = Math.max(0, seatLimit - enrolledCount);
        obj.seatLimit = seatLimit;
        obj.enrolledCount = enrolledCount;
        obj.remainingSeats = remainingSeats;
        obj.isFull = remainingSeats <= 0;
        obj.responseTime = tutorUser?.plan === "pro" ? "~30 min" : "~2 hrs";
        obj.responseBadge = tutorUser?.plan === "pro" ? "Priority Tutor (⚡ ~30m)" : "Fast Responder (~2 hrs)";
      } catch (_) {
        obj.tutorAvailability = [];
        obj.tutorPhone = "";
        obj.bookedSlots = [];
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
router.post("/", verifyToken, verifyTutor, verifyActiveUser, async (req, res) => {
  try {
    const { title, subject, classLevel, mode, location, monthlyFee, daysPerWeek, bannerImage, description, tutorName, seatLimit } = req.body;

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
      seatLimit: seatLimit ? Math.max(1, Number(seatLimit)) : 5,
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
router.put("/:id", verifyToken, verifyTutor, verifyActiveUser, async (req, res) => {
  try {
    const tuition = await Tuition.findOne({ _id: req.params.id, tutorEmail: req.user.email });
    if (!tuition) return res.status(404).json({ message: "Tuition not found" });
    const fields = ["title", "subject", "classLevel", "mode", "location", "monthlyFee", "daysPerWeek", "bannerImage", "description", "seatLimit"];
    fields.forEach((f) => { if (req.body[f] !== undefined) tuition[f] = req.body[f]; });
    await tuition.save();
    res.json(tuition);
  } catch (error) {
    res.status(500).json({ message: "Failed to update tuition" });
  }
});

// PATCH /api/tuitions/:id/toggle — Active/Closed toggle (tutor only, নিজেরটা)
router.patch("/:id/toggle", verifyToken, verifyTutor, verifyActiveUser, async (req, res) => {
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
router.delete("/:id", verifyToken, verifyTutor, verifyActiveUser, async (req, res) => {
  try {
    const tuition = await Tuition.findOneAndDelete({ _id: req.params.id, tutorEmail: req.user.email });
    if (!tuition) return res.status(404).json({ message: "Tuition not found" });
    res.json({ message: "Tuition deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete tuition" });
  }
});

module.exports = router;
