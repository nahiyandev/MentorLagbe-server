// users collection — doc-এর field list হুবহু
// তৈরি হয়: BetterAuth sign-up / profile update / Admin / Stripe webhook থেকে
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    image: { type: String, default: "" },
    role: {
      type: String,
      enum: ["student", "tutor", "admin"], // শুধু এই ৩টা role-ই চলবে
      required: true,
    },
    phone: { type: String, default: "" },
    bio: { type: String, default: "" },
    plan: {
      type: String,
      enum: ["free", "pro"], // নতুন user মানেই 'free'
      default: "free",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } } // createdAt auto বসবে
);

module.exports = mongoose.model("User", userSchema);
