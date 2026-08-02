# Firebox AI Studio

A VS Code-style AI coding assistant that orchestrates 7 specialized agents (Architect, Backend, Frontend, Database, Security, QA, Deployment) to generate project files live, with a Monaco code editor and GitHub integration.

## Running the project

Two workflows must both be running:
- **Start application** — Vite dev server on port 5000 (`npm run dev`)
- **Start Backend** — Express API server on port 3001 (`npm run server`)

## Required environment variables

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq AI API key (free at console.groq.com). Required for AI agent features. |
| `MONGODB_URI` | MongoDB Atlas connection string. Required for builds, history, and Git token storage. |

Without these set, the app loads but all AI/build/history features return 503 errors.

## Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Monaco Editor, lucide-react
- **Backend**: Express, Groq SDK (llama-3.3-70b-versatile), Mongoose + MongoDB

## How AI editing works

When a build already exists, the chat input switches to **edit mode** — the AI uses a targeted search/replace diff format (Aider-style) to change only the specific lines needed, rather than regenerating entire files. The `POST /api/edit-files` endpoint handles this.

The `POST /api/git/ai-edit` endpoint (used for GitHub repo files) also uses the same search/replace approach.

## Key files

- `FireboxAIStudio.jsx` — entire React UI (single component, ~3300 lines)
- `server/index.js` — Express routes including `/api/build` and `/api/edit-files`
- `server/agents/config.js` — 7 build agent definitions and system prompts
- `server/agents/runner.js` — SSE-streaming build agent pipeline
- `server/agents/analyzeConfig.js` — 7 analysis agent definitions for GitHub repo review
- `server/agents/analyzeRunner.js` — SSE-streaming analysis pipeline (repo context as input)
- `server/routes/git.js` — GitHub connect/file/AI-edit/push/analyze routes
- `server/utils/editParser.js` — search/replace diff parser and applicator
- `server/utils/fileParser.js` — `### FILE:` block extractor for build/analysis output

## GitHub repo analysis feature

When a user connects a GitHub repo in the Source Control panel, two options appear:
1. **Analyze with AI Agents** — fetches up to 20 key files from the repo, creates a Build record, and streams 7 analysis agents (Overview, Backend, Frontend, Database, Security, QA, Deployment review) generating markdown report files.
2. **Apply with AI** — targeted search/replace edits on individual files (existing feature).

Backend endpoints for analysis:
- `POST /api/git/analyze` — fetches repo files, creates a Build, returns `{ buildId }`
- `GET /api/git/analyze/:buildId/events` — SSE stream running the analysis pipeline

## User preferences

<!-- Add user preferences here as they are expressed -->
