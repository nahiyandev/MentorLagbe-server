// src/routes/applications.js
// Application routes — student applies, tutor accepts/rejects
const express = require("express");
const Application = require("../models/Application");
const Tuition = require("../models/Tuition");
const User = require("../models/User");
const Notification = require("../models/Notification");
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

    // Double-booking check: prevent applying for an already accepted slot
    const slotsToApply = Array.isArray(req.body.selectedSlots) && req.body.selectedSlots.length > 0
      ? req.body.selectedSlots
      : (preferredSchedule ? [preferredSchedule] : []);

    if (slotsToApply.length > 0) {
      const alreadyAccepted = await Application.find({
        tuitionId: tuition._id,
        status: "accepted",
      });

      const bookedSet = new Set();
      for (const accepted of alreadyAccepted) {
        if (Array.isArray(accepted.selectedSlots)) {
          for (const s of accepted.selectedSlots) bookedSet.add(s);
        }
        if (accepted.preferredSchedule) bookedSet.add(accepted.preferredSchedule);
      }

      const conflicts = slotsToApply.filter((s) => bookedSet.has(s));
      if (conflicts.length > 0) {
        return res.status(409).json({
          message: `The slot "${conflicts.join(", ")}" has already been booked and accepted for another student. Please pick an open slot.`,
          conflictingSlots: conflicts,
        });
      }
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
      selectedSlots: Array.isArray(req.body.selectedSlots) ? req.body.selectedSlots : [],
      studentNote,
      status: "pending",
    });

    // Notify tutor about incoming application
    try {
      await Notification.create({
        recipientEmail: tuition.tutorEmail,
        recipientRole: "tutor",
        title: "New Student Application",
        message: `${application.studentName} applied for "${tuition.title}" (${tuition.subject}).`,
        type: "application_received",
        link: "/dashboard/tutor/applicants",
      });
    } catch (notifErr) {
      console.warn("Could not send application notification to tutor:", notifErr);
    }

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

    // Double-booking guard when accepting
    if (status === "accepted") {
      const slotsToCheck = Array.isArray(application.selectedSlots) && application.selectedSlots.length > 0
        ? application.selectedSlots
        : (application.preferredSchedule ? [application.preferredSchedule] : []);

      if (slotsToCheck.length > 0) {
        const otherAccepted = await Application.find({
          tuitionId: application.tuitionId,
          status: "accepted",
          _id: { $ne: application._id },
        });

        const bookedSet = new Set();
        for (const other of otherAccepted) {
          if (Array.isArray(other.selectedSlots)) {
            for (const s of other.selectedSlots) bookedSet.add(s);
          }
          if (other.preferredSchedule) bookedSet.add(other.preferredSchedule);
        }

        const conflicting = slotsToCheck.filter((s) => bookedSet.has(s));
        if (conflicting.length > 0) {
          return res.status(409).json({
            message: `Double-booking prevention: Slot "${conflicting.join(", ")}" is already booked by another accepted student.`,
            conflictingSlots: conflicting,
          });
        }
      }
    }

    application.status = status;
    application.decidedAt = new Date();
    await application.save();

    // Notify student about application acceptance or rejection
    try {
      const isAccepted = status === "accepted";
      await Notification.create({
        recipientEmail: application.studentEmail,
        recipientRole: "student",
        title: isAccepted ? "Application Accepted! 🎉" : "Application Update",
        message: isAccepted
          ? `Congratulations! Your application for "${application.tuitionTitle}" was accepted by tutor ${application.tutorEmail}. Check details & download your admission slip.`
          : `Your application for "${application.tuitionTitle}" was not accepted. Browse other available batches on the platform.`,
        type: isAccepted ? "application_accepted" : "application_rejected",
        link: "/dashboard/student/my-applications",
      });
    } catch (notifErr) {
      console.warn("Could not send status notification to student:", notifErr);
    }

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: "Failed to update application" });
  }
});

// PATCH /api/applications/:id/meet-link — tutor sets or updates Google Meet link for accepted applicant
router.patch("/:id/meet-link", verifyToken, verifyTutor, async (req, res) => {
  try {
    const { meetLink } = req.body;
    const application = await Application.findOne({
      _id: req.params.id,
      tutorEmail: req.user.email,
    });
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }
    if (application.status !== "accepted") {
      return res.status(400).json({
        message: "Google Meet link can only be set for accepted applications",
      });
    }

    application.meetLink = (meetLink || "").trim();
    await application.save();

    // Notify student about the Meet link
    if (application.meetLink) {
      try {
        await Notification.create({
          recipientEmail: application.studentEmail,
          recipientRole: "student",
          title: "Class Meet Link Available! 🎥",
          message: `Your tutor provided the Google Meet link for "${application.tuitionTitle}". Click to join class!`,
          type: "system",
          link: "/dashboard/student/my-applications",
        });
      } catch (notifErr) {
        console.warn("Could not send meet link notification to student:", notifErr);
      }
    }

    res.json(application);
  } catch (error) {
    console.error("Failed to update meet link:", error);
    res.status(500).json({ message: "Failed to update meet link" });
  }
});

// PATCH /api/applications/:id — student only, pending applications can be edited
// Body: { studentPhone, preferredSchedule, studentNote }
router.patch("/:id", verifyToken, verifyStudent, async (req, res) => {
  try {
    const { studentPhone, preferredSchedule, selectedSlots, studentNote } = req.body;
    if (!studentPhone && !preferredSchedule && !selectedSlots && studentNote === undefined) {
      return res.status(400).json({ message: "No fields provided to update" });
    }

    const application = await Application.findOne({
      _id: req.params.id,
      studentEmail: req.user.email,
    });
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.status !== "pending") {
      return res.status(400).json({
        message: "Only pending applications can be edited",
      });
    }

    if (studentPhone) application.studentPhone = studentPhone.trim();
    if (preferredSchedule) application.preferredSchedule = preferredSchedule.trim();
    if (Array.isArray(selectedSlots)) application.selectedSlots = selectedSlots;
    if (studentNote !== undefined) application.studentNote = studentNote.trim();

    await application.save();
    res.json(application);
  } catch (error) {
    console.error("Failed to update application:", error);
    res.status(500).json({ message: error.message || "Failed to update application" });
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
