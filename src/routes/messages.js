// src/routes/messages.js
const express = require("express");
const Message = require("../models/Message");
const User = require("../models/User");
const Tuition = require("../models/Tuition");
const Notification = require("../models/Notification");
const { verifyToken } = require("../middlewares/auth");

const router = express.Router();

function getConversationId(emailA, emailB, tuitionId) {
  const pair = [emailA.toLowerCase().trim(), emailB.toLowerCase().trim()].sort().join("___");
  return tuitionId ? `${pair}__${tuitionId}` : pair;
}

// POST /api/messages — send direct message
router.post("/", verifyToken, async (req, res) => {
  try {
    const { recipientEmail, tuitionId, text } = req.body;
    if (!recipientEmail || !text || !text.trim()) {
      return res.status(400).json({ message: "Recipient email and message text are required" });
    }

    if (recipientEmail.toLowerCase() === req.user.email.toLowerCase()) {
      return res.status(400).json({ message: "You cannot message yourself" });
    }

    const senderUser = await User.findOne({ email: req.user.email });
    const recipientUser = await User.findOne({ email: recipientEmail });

    let tuitionTitle = "";
    if (tuitionId) {
      const tuition = await Tuition.findById(tuitionId);
      if (tuition) tuitionTitle = tuition.title;
    }

    const senderRole = req.user.role || senderUser?.role || "student";
    const recipientRole = recipientUser?.role || (senderRole === "student" ? "tutor" : "student");

    const normSenderEmail = req.user.email.toLowerCase().trim();
    const normRecipientEmail = recipientEmail.toLowerCase().trim();
    const conversationId = getConversationId(normSenderEmail, normRecipientEmail, tuitionId);

    const message = await Message.create({
      conversationId,
      tuitionId: tuitionId || null,
      tuitionTitle,
      senderEmail: normSenderEmail,
      senderName: senderUser?.name || normSenderEmail.split("@")[0],
      senderRole,
      recipientEmail: normRecipientEmail,
      recipientName: recipientUser?.name || normRecipientEmail.split("@")[0],
      recipientRole,
      text: text.trim(),
      isRead: false,
    });

    // Notify recipient in-app
    try {
      await Notification.create({
        recipientEmail: normRecipientEmail,
        recipientRole,
        title: `Message from ${message.senderName}`,
        message: `${message.senderName}: "${text.trim().slice(0, 60)}${text.trim().length > 60 ? "..." : ""}"`,
        type: "system",
        link: "/dashboard/messages",
      });
    } catch (notifErr) {
      console.warn("Could not create message notification:", notifErr);
    }

    res.status(201).json(message);
  } catch (error) {
    console.error("POST /api/messages error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
});

// GET /api/messages/unread-count — total unread messages for logged in user
router.get("/unread-count", verifyToken, async (req, res) => {
  try {
    const myEmail = (req.user.email || "").toLowerCase().trim();
    const count = await Message.countDocuments({
      recipientEmail: { $regex: new RegExp(`^${myEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      isRead: false,
    });
    res.json({ unreadCount: count });
  } catch (error) {
    console.error("GET /api/messages/unread-count error:", error);
    res.status(500).json({ message: "Failed to fetch unread message count", unreadCount: 0 });
  }
});

// GET /api/messages/conversations — list of active threads for user
router.get("/conversations", verifyToken, async (req, res) => {
  try {
    const myEmail = (req.user.email || "").toLowerCase().trim();
    const emailRegex = { $regex: new RegExp(`^${myEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };

    // Find all distinct conversation IDs involving user
    const messages = await Message.find({
      $or: [{ senderEmail: emailRegex }, { recipientEmail: emailRegex }],
    }).sort({ createdAt: -1 });

    const convoMap = new Map();

    for (const msg of messages) {
      if (!convoMap.has(msg.conversationId)) {
        const isMeSender = (msg.senderEmail || "").toLowerCase() === myEmail;
        const otherPartyEmail = isMeSender ? msg.recipientEmail : msg.senderEmail;
        const otherPartyName = isMeSender ? msg.recipientName : msg.senderName;
        const otherPartyRole = isMeSender ? msg.recipientRole : msg.senderRole;

        convoMap.set(msg.conversationId, {
          conversationId: msg.conversationId,
          tuitionId: msg.tuitionId || null,
          tuitionTitle: msg.tuitionTitle || "",
          otherParty: {
            email: otherPartyEmail,
            name: otherPartyName,
            role: otherPartyRole,
          },
          lastMessage: {
            text: msg.text,
            senderEmail: msg.senderEmail,
            senderName: msg.senderName,
            createdAt: msg.createdAt,
            isRead: msg.isRead,
          },
          unreadCount: 0,
        });
      }

      // Count unread if I am recipient
      if ((msg.recipientEmail || "").toLowerCase() === myEmail && !msg.isRead) {
        const item = convoMap.get(msg.conversationId);
        if (item) item.unreadCount += 1;
      }
    }

    res.json(Array.from(convoMap.values()));
  } catch (error) {
    console.error("GET /api/messages/conversations error:", error);
    res.status(500).json({ message: "Failed to fetch conversations" });
  }
});

// GET /api/messages/thread — get all messages in a specific conversation
router.get("/thread", verifyToken, async (req, res) => {
  try {
    const { otherUser, tuitionId, conversationId } = req.query;
    const myEmail = (req.user.email || "").toLowerCase().trim();
    const emailRegex = { $regex: new RegExp(`^${myEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };

    let targetConvoId = conversationId;
    if (!targetConvoId && otherUser) {
      targetConvoId = getConversationId(myEmail, otherUser, tuitionId);
    }

    if (!targetConvoId) {
      return res.status(400).json({ message: "otherUser or conversationId is required" });
    }

    // Mark messages where I am recipient as read
    await Message.updateMany(
      {
        conversationId: targetConvoId,
        recipientEmail: emailRegex,
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    const messages = await Message.find({
      conversationId: targetConvoId,
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error("GET /api/messages/thread error:", error);
    res.status(500).json({ message: "Failed to fetch thread" });
  }
});

module.exports = router;
