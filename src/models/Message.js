// src/models/Message.js
// Direct chat & inquiry messages between students and tutors
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    tuitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tuition",
      index: true,
    },
    tuitionTitle: { type: String, default: "" },
    senderEmail: { type: String, required: true, index: true },
    senderName: { type: String, required: true },
    senderRole: {
      type: String,
      enum: ["student", "tutor", "admin"],
      required: true,
    },
    recipientEmail: { type: String, required: true, index: true },
    recipientName: { type: String, required: true },
    recipientRole: {
      type: String,
      enum: ["student", "tutor", "admin"],
      required: true,
    },
    text: { type: String, required: true, trim: true },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("Message", messageSchema);
