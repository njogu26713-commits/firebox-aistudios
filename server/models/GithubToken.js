import mongoose from "mongoose";

const schema = new mongoose.Schema({
  _id:       { type: String, default: "singleton" },
  token:     { type: String, required: true },
  createdAt: { type: Date,   default: Date.now },
});

export default mongoose.model("GithubToken", schema);
