import express from "express";
import crypto from "node:crypto";
import { promisify } from "node:util";
import User from "../models/User.js";
import Session from "../models/Session.js";
import { isDBConnected } from "../db.js";

const router = express.Router();
const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = "firebox_session";
const SESSION_DAYS = 30;

function dbRequired(req, res, next) {
  if (!isDBConnected()) return res.status(503).json({ error: "Database not connected. Set MONGODB_URI in Railway to enable authentication." });
  next();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateCredentials(email, password) {
  if (!/^\S+@\S+\.\S+$/.test(email)) return "Enter a valid email address";
  if (String(password || "").length < 8) return "Password must be at least 8 characters";
  return null;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(String(password), salt, 64);
  return `${salt}:${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored || "").split(":");
  if (!salt || !expectedHex) return false;
  const actual = Buffer.from(await scrypt(String(password), salt, 64));
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function readCookie(req, name) {
  const source = String(req.headers.cookie || "");
  const part = source.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

function setSessionCookie(res, token, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

async function createSession(res, userId) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await Session.create({ tokenHash, userId, expiresAt });
  setSessionCookie(res, rawToken, SESSION_DAYS * 24 * 60 * 60);
}

export async function getCurrentUser(req) {
  const rawToken = readCookie(req, SESSION_COOKIE);
  if (!rawToken) return null;
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const session = await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).populate("userId");
  if (!session?.userId) return null;
  return session.userId;
}

function publicUser(user) {
  return { id: String(user._id), email: user.email, createdAt: user.createdAt };
}

router.post("/register", dbRequired, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const validationError = validateCredentials(email, password);
    if (validationError) return res.status(400).json({ error: validationError });
    const existing = await User.findOne({ email }).select("_id");
    if (existing) return res.status(409).json({ error: "An account with that email already exists" });
    const user = await User.create({ email, passwordHash: await hashPassword(password) });
    await createSession(res, user._id);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "An account with that email already exists" });
    res.status(500).json({ error: "Unable to create account" });
  }
});

router.post("/login", dbRequired, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const validationError = validateCredentials(email, password);
    if (validationError) return res.status(400).json({ error: validationError });
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await verifyPassword(password, user.passwordHash))) return res.status(401).json({ error: "Incorrect email or password" });
    user.lastLoginAt = new Date();
    await user.save();
    await createSession(res, user._id);
    res.json({ user: publicUser(user) });
  } catch {
    res.status(500).json({ error: "Unable to sign in" });
  }
});

router.get("/me", dbRequired, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    res.json({ user: user ? publicUser(user) : null });
  } catch { res.status(500).json({ error: "Unable to read the current session" }); }
});

export async function requireAuth(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    req.user = user;
    next();
  } catch { res.status(401).json({ error: "Authentication required" }); }
}

router.post("/logout", dbRequired, async (req, res) => {
  const rawToken = readCookie(req, SESSION_COOKIE);
  if (rawToken) {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await Session.deleteOne({ tokenHash }).catch(() => {});
  }
  setSessionCookie(res, "", 0);
  res.json({ ok: true });
});

function oauthUnavailable(provider) {
  return (req, res) => {
    const clientId = provider === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.GITHUB_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: `${provider === "google" ? "Google" : "GitHub"} sign-in is not configured yet. Add the OAuth credentials in Railway environment variables.` });
    res.status(501).json({ error: `${provider === "google" ? "Google" : "GitHub"} OAuth callback is reserved for the next configuration step.` });
  };
}

router.get("/google", oauthUnavailable("google"));
router.get("/github", oauthUnavailable("github"));

export default router;
