// src/models/Notification.js
// In-app notifications for students and tutors
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipientEmail: { type: String, required: true, index: true },
    recipientRole: {
      type: String,
      enum: ["student", "tutor", "admin"],
      default: "student",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "application_received",
        "application_accepted",
        "application_rejected",
        "tuition_approved",
        "session_reminder",
        "system",
      ],
      default: "system",
    },
    link: { type: String, default: "" },
    isRead: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("Notification", notificationSchema);
