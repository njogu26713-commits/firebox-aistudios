import mongoose from "mongoose";

const schema = new mongoose.Schema({
  _id:       { type: String, required: true },
  ownerId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  provider:  { type: String, enum: ["pat", "oauth"], default: "pat" },
  token:    { type: String, required: true, select: false },
  username: { type: String, default: "" },
  createdAt:{ type: Date, default: Date.now },
  updatedAt:{ type: Date, default: Date.now },
});

schema.index({ ownerId: 1 }, { unique: true });
export default mongoose.model("GithubToken", schema);
