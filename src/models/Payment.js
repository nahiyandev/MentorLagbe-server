// payments collection
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  userName: { type: String, required: true },
  userRole: {
    type: String,
    enum: ["student", "tutor", "admin"],
    required: true,
  },
  planName: { type: String, required: true }, // 'Tutor Pro' / 'Student Pro'
  amount: { type: Number, required: true },
  currency: { type: String, default: "usd" },
  paymentMethod: {
    type: String,
    enum: ["stripe", "bkash", "nagad"],
    default: "stripe",
  },
  senderNumber: { type: String, default: "" },
  transactionId: { type: String, required: true, unique: true },
  stripeSessionId: { type: String, default: "" },
  paymentStatus: {
    type: String,
    enum: ["paid", "pending", "failed"],
    default: "paid",
  },
  paidAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Payment", paymentSchema);
