const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    tuitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tuition",
      required: true,
    },
    reporterEmail: { type: String, required: true },
    reporterName: { type: String, default: "User" },
    reason: {
      type: String,
      enum: [
        "inaccurate_info",
        "fake_fee",
        "unresponsive_tutor",
        "inappropriate_content",
        "other",
      ],
      required: true,
    },
    details: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "investigating", "resolved", "dismissed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Report", reportSchema);
