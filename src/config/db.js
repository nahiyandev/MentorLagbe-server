// MongoDB connection (Mongoose)
// কাজ: .env-এর MONGODB_URI দিয়ে Atlas-এ connect করা
const mongoose = require("mongoose");

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
  } catch (error) {
    // DB connect না হলে server চালানো যাবে না — error দেখিয়ে বন্ধ
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

module.exports = connectDB;
