# Firebox AI Studio

A full-stack AI app builder: describe an app, and 7 real AI agents (powered by Groq's LLM API) generate every layer live — architecture, backend, frontend, database, security, tests, and deployment configs. Results are streamed in real-time and saved to MongoDB.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite (port 5000) |
| Backend | Node.js + Express (port 3001) |
| Database | MongoDB 7 via Mongoose |
| AI | Groq API (`llama-3.3-70b-versatile`) |
| Realtime | Server-Sent Events (SSE) |
| Styling | Tailwind CSS + inline design tokens |

## Architecture

```
Browser
  ├── Left column  — prompt input + live agent pipeline status
  └── Right column — streaming code viewer (tabbed per agent)
        │
        │ SSE  /api/build/:id/events
        ▼
Express (port 3001)
  ├── POST /api/build         — create build, return ID
  ├── GET  /api/build/:id/events — SSE stream of agent events
  ├── GET  /api/build/:id    — fetch completed build
  └── GET  /api/builds       — recent builds list
        │
        ├── Groq API  (7 sequential agents, streaming tokens)
        └── MongoDB   (persist builds + agent outputs)
```

## Project Structure

```
FireboxAIStudio.jsx     — Main React component (two-column UI)
server/
  index.js              — Express server entry point
  db.js                 — MongoDB connection
  models/Build.js       — Mongoose Build + Agent schema
  agents/
    config.js           — Agent definitions (name, system prompts)
    runner.js           — Pipeline runner with Groq streaming
src/
  main.jsx              — React entry
  index.css             — Tailwind directives
vite.config.js          — Vite + /api proxy to port 3001
```

## Running Locally (Replit)

Two workflows run concurrently:

```bash
npm run dev      # Vite frontend on :5000
npm run server   # Express backend on :3001
```

Vite proxies all `/api/*` requests to `http://localhost:3001`.

## Known Gotcha — Replit proxy in lockfile

`package-lock.json` regenerated on Replit will bake in `package-firewall.replit.local` as the registry for every package. Railway (and any external CI) cannot reach that host and the build fails. If you ever run `npm install` on Replit and then push, regenerate the lockfile with the public registry first:

```bash
rm package-lock.json && npm install --registry https://registry.npmjs.org
```

## Deploying to Railway

Single service — Express serves the built frontend + API:

1. Push to GitHub
2. Create a new Railway project → "Deploy from GitHub repo"
3. Railway auto-detects `railway.toml` and runs:
   - **Build**: `npm run build` (Vite → `dist/`)
   - **Start**: `npm start` (`NODE_ENV=production node server/index.js`)
4. Set environment variables in Railway dashboard (see Required Secrets)
5. In production, Express serves `dist/index.html` for all non-`/api` routes

## Required Secrets

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | From console.groq.com |
| `MONGODB_URI` | MongoDB Atlas connection string |

Copy `.env.example` to `.env` for local development.

## The 7 Agents

Each agent receives the user's description **plus all previous agents' outputs** as context, then generates its piece using Groq streaming:

1. **Architect** — Tech stack, system design, API surface, folder structure
2. **Backend** — Express routes, middleware, business logic
3. **Frontend** — React components, hooks, Tailwind UI
4. **Database** — Mongoose schemas, indexes, seed data, queries
5. **Security** — JWT auth middleware, validation, rate limiting, vulnerability audit
6. **QA** — Jest unit tests, Supertest integration tests, edge cases
7. **Deployment** — Dockerfile, docker-compose, GitHub Actions CI/CD

## Customizing Agents

Edit `server/agents/config.js` to change agent names, system prompts, or add/remove agents. The `AGENT_META` array in `FireboxAIStudio.jsx` mirrors this list for the UI — keep them in sync.

## User Preferences

- Keep the existing dark color scheme (tokens defined at top of `FireboxAIStudio.jsx`)
- Two-column layout: agent pipeline left, code viewer right
- Single self-contained frontend component pattern
