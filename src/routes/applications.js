// src/routes/applications.js
// Application routes — student applies, tutor accepts/rejects
const express = require("express");
const Application = require("../models/Application");
const Tuition = require("../models/Tuition");
const User = require("../models/User");
const { verifyToken, verifyStudent, verifyTutor } = require("../middlewares/auth");

const router = express.Router();

// POST /api/applications — student only
// Body: tuitionId, studentPhone, preferredSchedule, studentNote
// tuitionTitle/subject/monthlyFee/tutorEmail — server টিউশন থেকে নেয় (client-এর উপর ভরসা নয়)
router.post("/", verifyToken, verifyStudent, async (req, res) => {
  try {
    const { tuitionId, studentPhone, preferredSchedule, studentNote } = req.body;
    if (!tuitionId || !studentPhone) {
      return res.status(400).json({ message: "Tuition and phone are required" });
    }

    // শুধু approved + active টিউশনে apply করা যাবে
    const tuition = await Tuition.findOne({ _id: tuitionId, approvalStatus: "approved", isActive: true });
    if (!tuition) return res.status(404).json({ message: "Tuition not found or not available" });

    // একই student একই টিউশনে ২ বার apply করতে পারবে না
    const existing = await Application.findOne({ tuitionId, studentEmail: req.user.email });
    if (existing) {
      return res.status(409).json({ message: "You have already applied to this tuition" });
    }

    const user = await User.findOne({ email: req.user.email });

    const application = await Application.create({
      tuitionId: tuition._id,
      tuitionTitle: tuition.title,
      subject: tuition.subject,
      monthlyFee: tuition.monthlyFee,
      tutorEmail: tuition.tutorEmail,
      studentName: user?.name || req.body.studentName || "Student",
      studentEmail: req.user.email,
      studentPhone,
      preferredSchedule,
      studentNote,
      status: "pending",
    });
    res.status(201).json(application);
  } catch (error) {
    console.error("Failed to submit application:", error);
    res.status(500).json({ message: error.message || "Failed to submit application" });
  }
});

// GET /api/applications/my-applications — student-এর নিজের applications
router.get("/my-applications", verifyToken, verifyStudent, async (req, res) => {
  try {
    const applications = await Application.find({ studentEmail: req.user.email }).sort({ appliedAt: -1 });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch your applications" });
  }
});

// GET /api/applications/tutor — tutor-এর টিউশনগুলোতে আসা সব applicants
router.get("/tutor", verifyToken, verifyTutor, async (req, res) => {
  try {
    const applications = await Application.find({ tutorEmail: req.user.email }).sort({ appliedAt: -1 });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch applicants" });
  }
});

// PATCH /api/applications/:id/status — tutor only, নিজের টিউশনের application
// Body: { status: "accepted" | "rejected" }
router.patch("/:id/status", verifyToken, verifyTutor, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be accepted or rejected" });
    }
    const application = await Application.findOne({ _id: req.params.id, tutorEmail: req.user.email });
    if (!application) return res.status(404).json({ message: "Application not found" });
    application.status = status;
    await application.save();
    res.json(application);
  } catch (error) {
    res.status(500).json({ message: "Failed to update application" });
  }
});

// DELETE /api/applications/:id — student only, শুধু pending থাকলে cancel করা যাবে
router.delete("/:id", verifyToken, verifyStudent, async (req, res) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, studentEmail: req.user.email });
    if (!application) return res.status(404).json({ message: "Application not found" });
    if (application.status !== "pending") {
      return res.status(403).json({ message: "Only pending applications can be cancelled" });
    }
    await application.deleteOne();
    res.json({ message: "Application cancelled" });
  } catch (error) {
    res.status(500).json({ message: "Failed to cancel application" });
  }
});

module.exports = router;
