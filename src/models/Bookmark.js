const mongoose = require("mongoose");

const bookmarkSchema = new mongoose.Schema(
  {
    studentEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    tuitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tuition",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

bookmarkSchema.index({ studentEmail: 1, tuitionId: 1 }, { unique: true });

module.exports = mongoose.model("Bookmark", bookmarkSchema);
