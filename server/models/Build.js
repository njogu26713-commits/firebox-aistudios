import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  agent:    { type: String, required: true },
  path:     { type: String, required: true },
  content:  { type: String, default: "" },
  language: { type: String, default: "plaintext" },
  encoding: { type: String, enum: ["utf8", "base64"], default: "utf8" },
  isBinary: { type: Boolean, default: false },
});

const agentSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  status:      { type: String, enum: ["idle","working","done","error"], default: "idle" },
  output:      { type: String, default: "" },
  startedAt:   Date,
  completedAt: Date,
});

const buildSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  description: { type: String, required: true },
  projectName: { type: String, default: "firebox-project" },
  provider: {
    type: String,
    enum: ["cloud", "local", "openai", "anthropic", "google", "openrouter", "groq-agent", "openrouter-agent", "openai-agent", "gemini-agent"],
    default: "cloud",
  },
  localAi: {
    endpoint: { type: String, default: "" },
    model:    { type: String, default: "" },
    apiKey:   { type: String, default: "", select: false },
  },
  status:      { type: String, enum: ["running","complete","failed"], default: "running" },
  errorMessage: { type: String, default: "" },
  stack: { type: mongoose.Schema.Types.Mixed, default: null },
  executionState: { type: String, enum: ["running", "paused", "stopping", "stopped"], default: "running" },
  toolMode: { type: Boolean, default: false },
  importSource: { type: String, enum: ["github", "zip", "folder", "upload"], default: null },
  importMeta: { type: mongoose.Schema.Types.Mixed, default: null },
  repository: {
    provider: { type: String, enum: ["github"], default: undefined },
    owner: { type: String, default: "" },
    name: { type: String, default: "" },
    fullName: { type: String, default: "" },
    branch: { type: String, default: "" },
    defaultBranch: { type: String, default: "" },
    htmlUrl: { type: String, default: "" },
    pushEnabled: { type: Boolean, default: false },
    lastPushAt: Date,
  },
  agents:      [agentSchema],
  files:       [fileSchema],
  createdAt:   { type: Date, default: Date.now },
});

export default mongoose.model("Build", buildSchema);
