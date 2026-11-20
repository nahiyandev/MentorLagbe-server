// src/models/Review.js
// Review & rating collection for tuition & tutor
const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    tuitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tuition",
      required: true,
      index: true,
    },
    tuitionTitle: { type: String, required: true },
    tutorEmail: { type: String, required: true, index: true },
    studentName: { type: String, required: true },
    studentEmail: { type: String, required: true, index: true },
    studentImage: { type: String, default: "" },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    feedback: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// One review per student per tuition
reviewSchema.index({ tuitionId: 1, studentEmail: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
