// src/routes/admin.js
// Admin routes — users, tuitions, transactions, stats (admin only)
const express = require("express");
const User = require("../models/User");
const Tuition = require("../models/Tuition");
const Payment = require("../models/Payment");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");

const router = express.Router();

// এই file-এর সব route-এ verifyToken + verifyAdmin লাগবে (একবার এখানে লিখলেই হবে)
router.use(verifyToken, verifyAdmin);

// GET /api/admin/stats — Overview: users, tutors, pending/approved, revenue
router.get("/stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalTutors = await User.countDocuments({ role: "tutor" });
    const pendingTuitions = await Tuition.countDocuments({ approvalStatus: "pending" });
    const approvedTuitions = await Tuition.countDocuments({ approvalStatus: "approved" });
    const revenue = await Payment.aggregate([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    res.json({
      totalUsers,
      totalTutors,
      pendingTuitions,
      approvedTuitions,
      totalRevenue: revenue[0]?.total || 0,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

// GET /api/admin/users — সব users
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("-__v").sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// PATCH /api/admin/users/:id/role — user-এর role বদলানো
// Body: { role: "student" | "tutor" | "admin" }
router.patch("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    if (!["student", "tutor", "admin"].includes(role)) {
      return res.status(400).json({ message: "Role must be student, tutor or admin" });
    }
    // নিজের role নিজে বদলানো যাবে না — নাহলে নিজেকে lock করে ফেলবে
    if (String(req.user.id) === req.params.id) {
      return res.status(403).json({ message: "You cannot change your own role" });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-__v");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to update role" });
  }
});

// GET /api/admin/tuitions — সব টিউশন (pending সহ)
router.get("/tuitions", async (req, res) => {
  try {
    const tuitions = await Tuition.find().sort({ createdAt: -1 });
    res.json(tuitions);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tuitions" });
  }
});

// PATCH /api/admin/tuitions/:id/approve — টিউশন approve (public-এ দেখাবে)
router.patch("/tuitions/:id/approve", async (req, res) => {
  try {
    const tuition = await Tuition.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: "approved" },
      { new: true }
    );
    if (!tuition) return res.status(404).json({ message: "Tuition not found" });
    res.json(tuition);
  } catch (error) {
    res.status(500).json({ message: "Failed to approve tuition" });
  }
});

// PATCH /api/admin/tuitions/:id/reject — টিউশন reject
router.patch("/tuitions/:id/reject", async (req, res) => {
  try {
    const tuition = await Tuition.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: "rejected" },
      { new: true }
    );
    if (!tuition) return res.status(404).json({ message: "Tuition not found" });
    res.json(tuition);
  } catch (error) {
    res.status(500).json({ message: "Failed to reject tuition" });
  }
});

// PATCH /api/admin/tuitions/bulk-status — একসাথে একাধিক টিউশন approve / reject
router.patch("/tuitions/bulk-status", async (req, res) => {
  try {
    const { tuitionIds, status } = req.body;
    if (!Array.isArray(tuitionIds) || tuitionIds.length === 0) {
      return res.status(400).json({ message: "An array of tuitionIds is required" });
    }
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'approved' or 'rejected'" });
    }

    const result = await Tuition.updateMany(
      { _id: { $in: tuitionIds } },
      { $set: { approvalStatus: status } }
    );

    // Send notifications to tutors
    try {
      const Notification = require("../models/Notification");
      const affectedTuitions = await Tuition.find({ _id: { $in: tuitionIds } });
      const notifications = affectedTuitions.map((t) => ({
        recipientEmail: t.tutorEmail,
        recipientRole: "tutor",
        title: `Tuition Listing ${status === "approved" ? "Approved" : "Rejected"}`,
        message: `Your listing "${t.title}" was ${status} by Admin.`,
        type: status === "approved" ? "tuition_approved" : "system",
        link: `/tuitions/${t._id}`,
      }));
      if (notifications.length > 0) {
        await Notification.insertMany(notifications, { ordered: false });
      }
    } catch (notifErr) {
      console.warn("Bulk notification warning:", notifErr);
    }

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: `Successfully ${status} ${result.modifiedCount} tuition listings.`,
    });
  } catch (error) {
    console.error("Bulk status error:", error);
    res.status(500).json({ message: "Failed to update bulk tuition status" });
  }
});

// GET /api/admin/transactions — সব payment records
router.get("/transactions", async (req, res) => {
  try {
    const payments = await Payment.find().sort({ paidAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
});

module.exports = router;
