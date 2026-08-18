# Firebox AI Studio — Live Multi-Agent Build Experience

A drop-in React component that replaces a loading spinner with a live,
animated view of 7 AI agents (Architect, Backend, Frontend, Database,
Security, QA, Deployment) planning, building, testing, and deploying an app.

## Usage

```jsx
import FireboxAIStudio from "./FireboxAIStudio";

export default function App() {
  return <FireboxAIStudio />;
}
```

## Requirements
- React 18+
- Tailwind CSS (core utility classes only)
- lucide-react (`npm install lucide-react`)

## Notes
- Single self-contained file — no external state management needed.
- Google Fonts (Space Grotesk / IBM Plex Mono / Inter) are loaded via
  `@import` in the component's own `<style>` tag. Swap for local fonts if
  you need to work offline.
- Respects `prefers-reduced-motion`.
- The simulated build script (agent tasks, durations, the security
  failure/retry, and the handoff/chat messages) lives in the `AGENTS`
  array near the top of the file — edit it to reflect your real build
  pipeline or wire it up to real backend events.


## Full Local AI builds on Windows

Cloud AI continues to use the existing Railway backend. To let Local AI build complete applications on a user's computer, run the companion engine from `local-engine/` on the same Windows machine as Ollama.

1. Create a workspace folder, for example `C:\Users\YourName\FireboxProjects`.
2. Set `FIREBOX_WORKSPACE`, `FIREBOX_ENGINE_TOKEN` (at least 24 random characters), and `FIREBOX_ENGINE_PORT=8787` in the Windows terminal.
3. Set `OLLAMA_ENDPOINT=http://127.0.0.1:11434/v1` and `OLLAMA_MODEL` to an installed model such as `qwen3:0.6b`.
4. Start the engine with `npm run local-engine`.
5. In Firebox Settings → Local AI, enter `http://127.0.0.1:8787` and the same pairing token, then use **Test Local Engine**.
6. Select Local AI and start a build. The local engine runs the agent pipeline and Firebox-controlled tools on the Windows computer.

The engine binds only to localhost, confines generated projects to `FIREBOX_WORKSPACE`, validates paths, and uses an allowlist of development commands. Do not expose its port to the public internet.
