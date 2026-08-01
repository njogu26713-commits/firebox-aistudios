# Firebox AI Studio

A self-contained React component that replaces a loading spinner with a live, animated view of 7 AI agents (Architect, Backend, Frontend, Database, Security, QA, Deployment) planning and building an app.

## Stack
- React 18 + Vite
- Tailwind CSS
- lucide-react (icons)
- Google Fonts: Space Grotesk, IBM Plex Mono, Inter (loaded via `@import` inside the component)

## Project structure
- `FireboxAIStudio.jsx` — the single component (edit this to customize the agent pipeline)
- `src/main.jsx` — React entry point
- `src/index.css` — Tailwind directives
- `index.html` — HTML shell
- `vite.config.js` — Vite config (serves on port 5000)

## How to run
```
npm run dev
```
Starts the Vite dev server on port 5000.

## Customization
The simulated build pipeline (agent names, tasks, durations, the security failure/retry, and chat messages) lives in the `AGENTS` array near the top of `FireboxAIStudio.jsx`. Edit it to reflect a real pipeline or wire it up to real backend events.
