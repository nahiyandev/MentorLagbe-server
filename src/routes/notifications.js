// src/routes/notifications.js
const express = require("express");
const Notification = require("../models/Notification");
const { verifyToken } = require("../middlewares/auth");

const router = express.Router();

// GET /api/notifications — get notifications for current logged in user
router.get("/", verifyToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientEmail: req.user.email })
      .sort({ createdAt: -1 })
      .limit(30);

    const unreadCount = await Notification.countDocuments({
      recipientEmail: req.user.email,
      isRead: false,
    });

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

// PATCH /api/notifications/:id/read — mark single notification as read
router.patch("/:id/read", verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientEmail: req.user.email },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: "Failed to update notification" });
  }
});

// PATCH /api/notifications/mark-all-read — mark all as read
router.patch("/mark-all-read", verifyToken, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientEmail: req.user.email, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark all as read" });
  }
});

// POST /api/notifications/session-reminder — create reminder for upcoming session
router.post("/session-reminder", verifyToken, async (req, res) => {
  try {
    const { tuitionTitle, timeText, meetLink } = req.body;
    const notification = await Notification.create({
      recipientEmail: req.user.email,
      recipientRole: req.user.role || "student",
      title: "Class Session Reminder ⏰",
      message: `Reminder: Your class for "${tuitionTitle || "Tuition Session"}" is scheduled for ${timeText || "soon"}. Join link: ${meetLink || "Check Sessions dashboard"}.`,
      type: "session_reminder",
      link: "/dashboard/student/sessions",
    });
    res.status(201).json({ message: "Reminder scheduled successfully!", notification });
  } catch (error) {
    res.status(500).json({ message: "Failed to schedule reminder" });
  }
});

module.exports = router;
