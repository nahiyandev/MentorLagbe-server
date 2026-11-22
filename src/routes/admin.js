// src/routes/admin.js
// Admin routes — users, tuitions, transactions, stats (admin only)
const express = require("express");
const User = require("../models/User");
const Tuition = require("../models/Tuition");
const Payment = require("../models/Payment");
const Review = require("../models/Review");
const Coupon = require("../models/Coupon");
const Notification = require("../models/Notification");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");

const router = express.Router();

// এই file-এর সব route-এ verifyToken + verifyAdmin লাগবে (একবার এখানে লিখলেই হবে)
router.use(verifyToken, verifyAdmin);

// GET /api/admin/stats — Overview: users, tutors, pending/approved, revenue, reviews
router.get("/stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalTutors = await User.countDocuments({ role: "tutor" });
    const totalReviews = await Review.countDocuments();
    const pendingTuitions = await Tuition.countDocuments({ approvalStatus: "pending" });
    const approvedTuitions = await Tuition.countDocuments({ approvalStatus: "approved" });

    const revenueByCurrency = await Payment.aggregate([
      { $match: { paymentStatus: "paid" } },
      {
        $group: {
          _id: { $toLower: { $ifNull: ["$currency", "usd"] } },
          total: { $sum: "$amount" },
        },
      },
    ]);

    let stripeRevenueUsd = 0;
    let localRevenueBdt = 0;

    for (const item of revenueByCurrency) {
      if (item._id === "bdt") {
        localRevenueBdt = item.total;
      } else {
        stripeRevenueUsd += item.total;
      }
    }

    let pendingReports = 0;
    try {
      const Report = require("../models/Report");
      pendingReports = await Report.countDocuments({ status: "pending" });
    } catch {
      pendingReports = 0;
    }

    res.json({
      totalUsers,
      totalTutors,
      totalReviews,
      pendingTuitions,
      approvedTuitions,
      totalRevenue: stripeRevenueUsd,
      stripeRevenueUsd,
      localRevenueBdt,
      pendingReports,
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

// PATCH /api/admin/users/:id/status — Admin block / unblock user
// Body: { status: "active" | "blocked", reason: "optional text" }
router.patch("/users/:id/status", async (req, res) => {
  try {
    const { status, reason } = req.body;
    if (!["active", "blocked"].includes(status)) {
      return res.status(400).json({ message: "Status must be active or blocked" });
    }

    // Admin cannot block their own account
    if (String(req.user.id) === req.params.id) {
      return res.status(403).json({ message: "You cannot block your own account" });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Admin cannot block another admin
    if (targetUser.role === "admin") {
      return res.status(403).json({ message: "Cannot block an administrator account" });
    }

    const updateData = {};
    if (status === "blocked") {
      updateData.status = "blocked";
      updateData.blockedReason = typeof reason === "string" ? reason.trim() : "";
      updateData.blockedAt = new Date();
    } else {
      updateData.status = "active";
      updateData.blockedReason = "";
      updateData.blockedAt = null;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).select("-__v");

    // Create Notification for the user
    try {
      await Notification.create({
        recipientEmail: updatedUser.email,
        recipientRole: updatedUser.role,
        title: status === "blocked" ? "Account Blocked" : "Account Unblocked",
        message:
          status === "blocked"
            ? `Your account was blocked by an administrator.${updatedUser.blockedReason ? ` Reason: ${updatedUser.blockedReason}.` : ""} Contact support to appeal.`
            : "Your account has been unblocked by an administrator. All privileges are restored.",
        type: "system",
        link: "/dashboard",
      });
    } catch (notifErr) {
      console.warn("Failed to create status change notification:", notifErr);
    }

    res.json(updatedUser);
  } catch (error) {
    console.error("PATCH /api/admin/users/:id/status error:", error);
    res.status(500).json({ message: "Failed to update user status" });
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

// PATCH /api/admin/tuitions/:id/reject — টিউশন reject (isActive false করা হয় যাতে active ব্যাজ না থাকে)
router.patch("/tuitions/:id/reject", async (req, res) => {
  try {
    const tuition = await Tuition.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: "rejected", isActive: false },
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

    const updatePayload = { approvalStatus: status };
    if (status === "rejected") {
      updatePayload.isActive = false;
    }

    const result = await Tuition.updateMany(
      { _id: { $in: tuitionIds } },
      { $set: updatePayload }
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

// GET /api/admin/coupons — list all coupons
router.get("/coupons", async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch coupons" });
  }
});

// POST /api/admin/coupons — create a new promo discount coupon
router.post("/coupons", async (req, res) => {
  try {
    const {
      code,
      discountType = "percentage",
      discountValue,
      maxUses = 100,
      expiresAt,
      description,
    } = req.body;

    if (!code || !discountValue) {
      return res.status(400).json({ message: "Code and discount value are required" });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await Coupon.findOne({ code: cleanCode });
    if (existing) {
      return res.status(409).json({ message: "Coupon code already exists" });
    }

    const coupon = await Coupon.create({
      code: cleanCode,
      discountType: ["percentage", "fixed"].includes(discountType) ? discountType : "percentage",
      discountValue: Number(discountValue),
      maxUses: Number(maxUses) || 100,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      description: description ? description.trim() : "",
      createdBy: req.user.email,
    });

    res.status(201).json(coupon);
  } catch (error) {
    console.error("Create coupon error:", error);
    res.status(500).json({ message: error.message || "Failed to create coupon" });
  }
});

// PATCH /api/admin/coupons/:id/toggle — toggle coupon active status
router.patch("/coupons/:id/toggle", async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json(coupon);
  } catch (error) {
    res.status(500).json({ message: "Failed to toggle coupon status" });
  }
});

// DELETE /api/admin/coupons/:id — delete a coupon
router.delete("/coupons/:id", async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json({ message: "Coupon deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete coupon" });
  }
});

module.exports = router;
