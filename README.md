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
