const express = require("express");
const Report = require("../models/Report");
const Tuition = require("../models/Tuition");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");

const router = express.Router();

// POST /api/reports — Submit a listing report
router.post("/", verifyToken, async (req, res) => {
  try {
    const { tuitionId, reason, details } = req.body;
    if (!tuitionId || !reason || !details || !details.trim()) {
      return res.status(400).json({ message: "Tuition ID, reason, and details are required." });
    }

    const tuition = await Tuition.findById(tuitionId);
    if (!tuition) {
      return res.status(404).json({ message: "Tuition listing not found." });
    }

    const report = await Report.create({
      tuitionId,
      reporterEmail: req.user.email,
      reporterName: req.user.name || "User",
      reason,
      details: details.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Listing reported successfully. Our team will review it shortly.",
      report,
    });
  } catch (error) {
    console.error("Error creating report:", error);
    return res.status(500).json({ message: "Failed to submit report." });
  }
});

// GET /api/reports — Admin view all reports
router.get("/", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("tuitionId", "title subject tutorName tutorEmail monthlyFee")
      .sort({ createdAt: -1 });
    return res.json({ reports });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return res.status(500).json({ message: "Failed to fetch reports." });
  }
});

// PATCH /api/reports/:id/status — Admin update report status
router.patch("/:id/status", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "investigating", "resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value." });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!report) {
      return res.status(404).json({ message: "Report not found." });
    }

    return res.json({ success: true, report });
  } catch (error) {
    console.error("Error updating report status:", error);
    return res.status(500).json({ message: "Failed to update report status." });
  }
});

module.exports = router;
