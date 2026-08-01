import mongoose from "mongoose";

// Disable Mongoose operation buffering so calls fail immediately when not connected
mongoose.set("bufferCommands", false);

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

export async function connectDB() {
  if (!process.env.MONGODB_URI) {
    console.warn("⚠️  MONGODB_URI not set — database features unavailable. Set it to enable full functionality.");
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    // Don't exit — let the server run so non-DB routes still work
  }
}
