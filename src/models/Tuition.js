// tuitions collection — doc-এর field list হুবহু
// বানায়: Tutor (post-tuition form থেকে); approve/reject করে: Admin
const mongoose = require("mongoose");

const tuitionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subject: { type: String, required: true },
    classLevel: { type: String, required: true },
    mode: {
      type: String,
      enum: ["Online", "Offline"],
      required: true,
    },
    location: { type: String, required: true },
    monthlyFee: { type: Number, required: true },
    daysPerWeek: { type: Number, required: true },
    bannerImage: { type: String, default: "" }, // ImgBB direct upload থেকে URL
    description: { type: String, required: true },
    tutorName: { type: String, required: true },
    tutorEmail: { type: String, required: true },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending", // নতুন post মানেই pending — Admin approve না করলে public-এ আসবে না
    },
    isActive: { type: Boolean, default: true }, // Tutor নিজে Active/Closed করতে পারে
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("Tuition", tuitionSchema);
