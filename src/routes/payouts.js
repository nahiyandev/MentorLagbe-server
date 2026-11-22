const express = require("express");
const router = express.Router();
const PayoutRequest = require("../models/PayoutRequest");
const Notification = require("../models/Notification");
const { verifyToken, verifyTutor, verifyAdmin, verifyActiveUser } = require("../middlewares/auth");

// POST /api/payouts — tutor submits a payout request
router.post("/", verifyToken, verifyTutor, verifyActiveUser, async (req, res) => {
  try {
    const { amount, paymentMethod, accountNumber } = req.body;
    const tutorEmail = req.user.email;
    const tutorName = req.user.name || "Tutor";

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < 100) {
      return res.status(400).json({ message: "Minimum payout request is ৳100." });
    }

    if (!paymentMethod || !["bkash", "nagad", "bank"].includes(paymentMethod.toLowerCase())) {
      return res.status(400).json({ message: "Invalid payment method. Choose bKash, Nagad, or Bank." });
    }

    if (!accountNumber || typeof accountNumber !== "string" || accountNumber.trim().length < 6) {
      return res.status(400).json({ message: "Valid account number or phone is required." });
    }

    const payout = await PayoutRequest.create({
      tutorEmail,
      tutorName,
      amount: parsedAmount,
      paymentMethod: paymentMethod.toLowerCase(),
      accountNumber: accountNumber.trim(),
      status: "pending",
      requestedAt: new Date(),
    });

    res.status(201).json(payout);
  } catch (error) {
    console.error("Error creating payout request:", error);
    res.status(500).json({ message: "Failed to submit payout request." });
  }
});

// GET /api/payouts/my-requests — tutor's personal payout request history
router.get("/my-requests", verifyToken, verifyTutor, async (req, res) => {
  try {
    const email = req.user.email;
    const requests = await PayoutRequest.find({
      $or: [{ tutorEmail: email }, { tutorEmail: email.toLowerCase() }],
    }).sort({ requestedAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error("Error fetching tutor payouts:", error);
    res.status(500).json({ message: "Failed to fetch payout requests." });
  }
});

// GET /api/payouts/admin — admin lists all payout requests
router.get("/admin", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const requests = await PayoutRequest.find().sort({ requestedAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error("Error fetching admin payouts:", error);
    res.status(500).json({ message: "Failed to fetch payouts." });
  }
});

// PATCH /api/payouts/:id — admin approves or rejects payout request
router.patch("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { status, adminNote = "", transactionReference = "" } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be approved or rejected." });
    }

    const payout = await PayoutRequest.findById(req.params.id);
    if (!payout) {
      return res.status(404).json({ message: "Payout request not found." });
    }

    payout.status = status;
    payout.adminNote = (adminNote || "").trim();
    payout.transactionReference = (transactionReference || "").trim();
    payout.processedAt = new Date();
    await payout.save();

    // Send notification to tutor
    try {
      await Notification.create({
        recipientEmail: payout.tutorEmail,
        recipientRole: "tutor",
        title: status === "approved" ? "Payout Approved! 💸" : "Payout Request Update",
        message:
          status === "approved"
            ? `Your payout request of ৳${payout.amount.toLocaleString()} via ${payout.paymentMethod.toUpperCase()} has been approved. Reference: ${payout.transactionReference || "Processed"}`
            : `Your payout request of ৳${payout.amount.toLocaleString()} was rejected. Reason: ${payout.adminNote || "Please contact admin."}`,
        type: "system",
        link: "/dashboard/tutor/earnings",
      });
    } catch (e) {
      // non-blocking
    }

    res.json(payout);
  } catch (error) {
    console.error("Error updating payout status:", error);
    res.status(500).json({ message: "Failed to update payout request." });
  }
});

module.exports = router;
