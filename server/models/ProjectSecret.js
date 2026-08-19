import mongoose from "mongoose";

const projectSecretSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  buildId: { type: mongoose.Schema.Types.ObjectId, ref: "Build", required: true, index: true },
  key: { type: String, required: true, trim: true, match: /^[A-Z_][A-Z0-9_]*$/ },
  encryptedValue: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: false });

projectSecretSchema.index({ ownerId: 1, buildId: 1, key: 1 }, { unique: true });

export default mongoose.model("ProjectSecret", projectSecretSchema);
