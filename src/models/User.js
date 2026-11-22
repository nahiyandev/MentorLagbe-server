// users collection — doc-এর field list হুবহু
// তৈরি হয়: BetterAuth sign-up / profile update / Admin / Stripe webhook থেকে
const mongoose = require("mongoose");

const availabilitySlotSchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    isAvailable: { type: Boolean, default: true },
    slots: [{ type: String }],
  },
  { _id: false }
);

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
    status: { type: String, enum: ["active", "blocked"], default: "active" },
    blockedReason: { type: String, default: "" },
    blockedAt: { type: Date, default: null },
    availability: {
      type: [availabilitySlotSchema],
      default: [
        { day: "Saturday", isAvailable: true, slots: ["10:00 AM - 12:00 PM", "6:00 PM - 8:00 PM"] },
        { day: "Sunday", isAvailable: true, slots: ["6:00 PM - 8:00 PM"] },
        { day: "Monday", isAvailable: true, slots: ["6:00 PM - 8:00 PM"] },
        { day: "Tuesday", isAvailable: true, slots: ["6:00 PM - 8:00 PM"] },
        { day: "Wednesday", isAvailable: true, slots: ["6:00 PM - 8:00 PM"] },
        { day: "Thursday", isAvailable: false, slots: [] },
        { day: "Friday", isAvailable: false, slots: [] },
      ],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } } // createdAt auto বসবে
);

module.exports = mongoose.model("User", userSchema);
