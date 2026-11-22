const mongoose = require("mongoose");

const payoutRequestSchema = new mongoose.Schema(
  {
    tutorEmail: { type: String, required: true },
    tutorName: { type: String, required: true },
    amount: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ["bkash", "nagad", "bank"],
      required: true,
    },
    accountNumber: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminNote: { type: String, default: "" },
    transactionReference: { type: String, default: "" },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PayoutRequest", payoutRequestSchema);
