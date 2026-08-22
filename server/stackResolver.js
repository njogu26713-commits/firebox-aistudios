const PROFILES = {
  web: { profile: "web-app", language: "TypeScript", framework: "React", buildTool: "Vite", runtime: "Node.js", styling: "Tailwind CSS" },
  fullstack: { profile: "full-stack-web", language: "TypeScript", framework: "React", buildTool: "Vite", runtime: "Node.js + Express", styling: "Tailwind CSS" },
  next: { profile: "nextjs-app", language: "TypeScript", framework: "Next.js", buildTool: "Next.js", runtime: "Node.js", styling: "Tailwind CSS" },
  python: { profile: "python-api", language: "Python", framework: "FastAPI", buildTool: "uv", runtime: "Python", styling: null },
  mobile: { profile: "mobile", language: "TypeScript", framework: "React Native", buildTool: "Expo", runtime: "Node.js", styling: "NativeWind" },
  static: { profile: "static-website", language: "JavaScript", framework: "None", buildTool: "None", runtime: "Browser", styling: "CSS" },
};

const asText = value => String(value || "").toLowerCase();
const fileNames = files => (Array.isArray(files) ? files : []).map(file => typeof file === "string" ? file : file?.path).filter(Boolean).map(asText);

function detectExisting(files, project = {}) {
  const names = fileNames(files);
  const joined = names.join(" ");
  const packageJson = files?.find(file => (file?.path || file) === "package.json");
  const packageText = typeof packageJson?.content === "string" ? asText(packageJson.content) : "";
  const source = `${joined} ${packageText}`;
  const language = /\.tsx?$|tsconfig|typescript/.test(source) ? "TypeScript" : /\.jsx?$|package\.json/.test(source) ? "JavaScript" : /\.py$|requirements\.txt|pyproject\.toml/.test(source) ? "Python" : /\.java$/.test(source) ? "Java" : "Unknown";
  const framework = /next\.config|next\//.test(source) ? "Next.js" : /react|\.jsx|\.tsx/.test(source) ? "React" : /vue|vite\.config/.test(source) ? "Vue or Vite" : /angular\.json/.test(source) ? "Angular" : /fastapi|requirements\.txt|pyproject/.test(source) ? "FastAPI or Python" : /express/.test(packageText) ? "Express" : "Unknown";
  const buildTool = /vite\.config|vite/.test(source) ? "Vite" : /next\.config|next\//.test(source) ? "Next.js" : /angular\.json/.test(source) ? "Angular CLI" : /expo|app\.json/.test(source) ? "Expo" : /pyproject|requirements\.txt/.test(source) ? "Python tooling" : "Unknown";
  const runtime = language === "Python" ? "Python" : language === "Java" ? "JVM" : "Node.js";
  const styling = /tailwind/.test(source) ? "Tailwind CSS" : /\.css$|\.scss$/.test(source) ? "CSS" : "Unknown";
  const database = /mongodb|mongoose/.test(packageText) ? "MongoDB" : /postgres|pg|prisma/.test(packageText) ? "PostgreSQL" : /mysql|sequelize/.test(packageText) ? "MySQL" : /sqlite/.test(packageText) ? "SQLite" : /redis|ioredis/.test(packageText) ? "Redis" : "None detected";
  return { mode: "existing", profile: "detected-existing", language, framework, buildTool, runtime, styling, database, source: project.source || "existing-project", confidence: names.length ? "high" : "low" };
}

function chooseProfile(description, preferences = {}) {
  const text = asText(description);
  if (preferences.framework) {
    const requested = asText(preferences.framework);
    if (requested.includes("next")) return PROFILES.next;
    if (requested.includes("python") || requested.includes("fastapi")) return PROFILES.python;
    if (requested.includes("native") || requested.includes("expo") || requested.includes("mobile")) return PROFILES.mobile;
    if (requested.includes("html") || requested.includes("static")) return PROFILES.static;
    if (requested.includes("express") || requested.includes("full")) return PROFILES.fullstack;
  }
  if (/mobile|ios|android|react native|expo/.test(text)) return PROFILES.mobile;
  if (/python|fastapi|data processing|data science|machine learning api/.test(text)) return PROFILES.python;
  if (/next\.js|nextjs/.test(text)) return PROFILES.next;
  if (/static|landing page|portfolio|html and css|simple website/.test(text)) return PROFILES.static;
  if (/api|backend|dashboard|admin|auth|login|users|database|platform|marketplace|booking|ecommerce|real estate|school management/.test(text)) return PROFILES.fullstack;
  return PROFILES.web;
}

function resolveDatabase(description, profile, preferences = {}, existing = null) {
  if (existing) return { required: existing.database !== "None detected", primary: existing.database, additional: [], reason: "Preserved from the existing project." };
  const requested = asText(preferences.database);
  const text = asText(description);
  const dataNeeded = /database|data|users|accounts|auth|login|properties|listings|orders|payments|bookings|messages|records|save|dashboard|platform|marketplace|inventory|school management/.test(text);
  const preferred = ["postgresql", "mongodb", "mysql", "sqlite"].find(name => requested.includes(name));
  const primary = preferred ? ({ postgresql: "PostgreSQL", mongodb: "MongoDB", mysql: "MySQL", sqlite: "SQLite" }[preferred]) : (requested === "none" ? "None" : null) || (/document|catalog|flexible schema/.test(text) ? "MongoDB" : /prototype|local only|single user/.test(text) ? "SQLite" : dataNeeded ? "PostgreSQL" : "None");
  const redis = /cache|caching|queue|job|rate limit|session/.test(text);
  return { required: primary !== "None", primary, additional: redis ? ["Redis"] : [], reason: primary === "None" ? "No persistent data requirement detected." : `Selected for the requested ${profile.profile} requirements.` };
}

export function resolveStack({ description = "", files = [], projectType, preferences = {}, project = {} } = {}) {
  const existing = projectType === "existing" || files.length > 0;
  if (existing) {
    const detected = detectExisting(files, project);
    return { ...detected, database: resolveDatabase(description, detected, preferences, detected), locked: true, instruction: "Preserve the detected stack. Do not change the language, framework, runtime, or database unless the user explicitly requests it or a demonstrated technical reason requires it." };
  }
  const profile = chooseProfile(description, preferences);
  const stack = { mode: "new", ...profile, packageManager: preferences.packageManager || "pnpm" };
  return { ...stack, database: resolveDatabase(description, profile, preferences), locked: true, instruction: "Use this selected stack. Do not change it unless there is a demonstrated technical reason and the user is informed." };
}

export { PROFILES };
