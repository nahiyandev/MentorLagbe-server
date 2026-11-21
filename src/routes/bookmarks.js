// src/routes/bookmarks.js
const express = require("express");
const mongoose = require("mongoose");
const Bookmark = require("../models/Bookmark");
const Tuition = require("../models/Tuition");
const { verifyToken } = require("../middlewares/auth");

const router = express.Router();

// POST /api/bookmarks/toggle — Toggle bookmark status for a tuition
router.post("/toggle", verifyToken, async (req, res) => {
  try {
    const { tuitionId } = req.body;
    if (!tuitionId || !mongoose.Types.ObjectId.isValid(tuitionId)) {
      return res.status(400).json({ message: "Valid tuitionId is required" });
    }

    const email = req.user.email.toLowerCase().trim();

    // Check tuition existence
    const tuition = await Tuition.findById(tuitionId);
    if (!tuition) {
      return res.status(404).json({ message: "Tuition not found" });
    }

    const existing = await Bookmark.findOne({ studentEmail: email, tuitionId });

    if (existing) {
      await Bookmark.deleteOne({ _id: existing._id });
      return res.json({
        bookmarked: false,
        message: "Tuition removed from bookmarks",
      });
    }

    await Bookmark.create({
      studentEmail: email,
      tuitionId,
    });

    return res.status(201).json({
      bookmarked: true,
      message: "Tuition saved to your bookmarks",
    });
  } catch (error) {
    console.error("Error in toggle bookmark:", error);
    return res.status(500).json({ message: "Failed to update bookmark" });
  }
});

// GET /api/bookmarks/ids — Get array of tuition IDs bookmarked by the current user
router.get("/ids", verifyToken, async (req, res) => {
  try {
    const email = req.user.email.toLowerCase().trim();
    const bookmarks = await Bookmark.find({ studentEmail: email }).select("tuitionId").lean();
    const ids = bookmarks.map((b) => b.tuitionId.toString());
    return res.json({ ids });
  } catch (error) {
    console.error("Error fetching bookmark ids:", error);
    return res.status(500).json({ message: "Failed to fetch bookmark IDs" });
  }
});

// GET /api/bookmarks — Get all populated bookmarked tuitions for the current user
router.get("/", verifyToken, async (req, res) => {
  try {
    const email = req.user.email.toLowerCase().trim();
    const bookmarks = await Bookmark.find({ studentEmail: email })
      .populate("tuitionId")
      .sort({ createdAt: -1 })
      .lean();

    // Filter out bookmarks where the underlying tuition was deleted
    const validBookmarks = bookmarks
      .filter((b) => b.tuitionId != null)
      .map((b) => ({
        bookmarkId: b._id,
        savedAt: b.createdAt,
        tuition: b.tuitionId,
      }));

    return res.json({ bookmarks: validBookmarks });
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    return res.status(500).json({ message: "Failed to fetch bookmarks" });
  }
});

// DELETE /api/bookmarks/:tuitionId — Remove a specific bookmark
router.delete("/:tuitionId", verifyToken, async (req, res) => {
  try {
    const { tuitionId } = req.params;
    if (!tuitionId || !mongoose.Types.ObjectId.isValid(tuitionId)) {
      return res.status(400).json({ message: "Valid tuitionId is required" });
    }

    const email = req.user.email.toLowerCase().trim();
    const result = await Bookmark.deleteOne({ studentEmail: email, tuitionId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    return res.json({ success: true, message: "Bookmark removed" });
  } catch (error) {
    console.error("Error deleting bookmark:", error);
    return res.status(500).json({ message: "Failed to remove bookmark" });
  }
});

module.exports = router;
