import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: null },
});

export default mongoose.model("User", userSchema);
