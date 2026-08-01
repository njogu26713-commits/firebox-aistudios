import mongoose from "mongoose";

const agentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: {
    type: String,
    enum: ["idle", "working", "done", "error"],
    default: "idle",
  },
  output: { type: String, default: "" },
  startedAt: Date,
  completedAt: Date,
});

const buildSchema = new mongoose.Schema({
  description: { type: String, required: true },
  status: {
    type: String,
    enum: ["running", "complete", "failed"],
    default: "running",
  },
  agents: [agentSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Build", buildSchema);
