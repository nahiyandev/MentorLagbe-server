// applications collection — doc-এর field list হুবহু
// বানায়: Student (Apply form থেকে); status বদলায়: Tutor (accepted/rejected)
const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  tuitionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tuition",
    required: true,
  },
  tuitionTitle: { type: String, required: true },
  subject: { type: String, required: true },
  monthlyFee: { type: Number, required: true },
  tutorEmail: { type: String, required: true },
  studentName: { type: String, required: true },
  studentEmail: { type: String, required: true },
  studentPhone: { type: String, required: true },
  preferredSchedule: { type: String, required: true },
  studentNote: { type: String, default: "" },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending",
  },
  appliedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Application", applicationSchema);
