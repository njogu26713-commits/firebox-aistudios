import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  agent:    { type: String, required: true },
  path:     { type: String, required: true },
  content:  { type: String, default: "" },
  language: { type: String, default: "plaintext" },
});

const agentSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  status:      { type: String, enum: ["idle","working","done","error"], default: "idle" },
  output:      { type: String, default: "" },
  startedAt:   Date,
  completedAt: Date,
});

const buildSchema = new mongoose.Schema({
  description: { type: String, required: true },
  provider: {
    type: String,
    enum: ["cloud", "local"],
    default: "cloud",
  },
  localAi: {
    endpoint: { type: String, default: "" },
    model:    { type: String, default: "" },
    apiKey:   { type: String, default: "", select: false },
  },
  status:      { type: String, enum: ["running","complete","failed"], default: "running" },
  agents:      [agentSchema],
  files:       [fileSchema],
  createdAt:   { type: Date, default: Date.now },
});

export default mongoose.model("Build", buildSchema);
