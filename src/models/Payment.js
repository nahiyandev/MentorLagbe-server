// payments collection — doc-এর field list হুবহু
// বানায়: Stripe webhook (checkout success-এর পর) — frontend থেকে নয়
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  userName: { type: String, required: true },
  userRole: {
    type: String,
    enum: ["student", "tutor"],
    required: true,
  },
  planName: { type: String, required: true }, // 'Tutor Pro' / 'Student Pro'
  amount: { type: Number, required: true },
  currency: { type: String, default: "usd" },
  transactionId: { type: String, required: true, unique: true },
  stripeSessionId: { type: String, required: true },
  paymentStatus: {
    type: String,
    enum: ["paid"],
    default: "paid",
  },
  paidAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Payment", paymentSchema);
