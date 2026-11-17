
const express = require("express");
const Tuition = require("../models/Tuition");
const User = require("../models/User");
const { verifyToken, verifyTutor } = require("../middlewares/auth");

const router = express.Router();

// GET /api/tuitions — public (শুধু approved + active)
// ?search= (title/subject), ?subject=, ?classLevel=, ?mode=Online|Offline
router.get("/", async (req, res) => {
  try {
    const { search, subject, classLevel, mode } = req.query;

    const filter = { approvalStatus: "approved", isActive: true };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }
    if (subject) filter.subject = subject;
    if (classLevel) filter.classLevel = classLevel;
    if (mode) filter.mode = mode;

    const tuitions = await Tuition.find(filter).sort({ createdAt: -1 });
    res.json(tuitions);
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

// GET /api/tuitions/:id — public details (শুধু approved + active)
router.get("/:id", async (req, res) => {
  try {
    const tuition = await Tuition.findOne({
      _id: req.params.id,
      approvalStatus: "approved",
      isActive: true,
    });
    if (!tuition) return res.status(404).json({ message: "Tuition not found" });
    res.json(tuition);
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
      tutorName, tutorEmail: req.user.email,
      approvalStatus: "pending", // admin approve না করা পর্যন্ত public-এ দেখাবে না
      isActive: true,
    });
    res.status(201).json(tuition);
  } catch (error) {
    res.status(500).json({ message: "Failed to create tuition" });
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
