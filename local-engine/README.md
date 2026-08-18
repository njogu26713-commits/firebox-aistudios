# Firebox Local Engine

The Firebox Local Engine is a Windows companion service that lets the deployed Firebox web app use a user's local Ollama model for full project builds while preserving Firebox-controlled development tools.

## Architecture

The Railway web app remains the Cloud AI engine and keeps its existing `/api/build`, `/api/chat`, and `/api/edit-files` routes unchanged for Cloud AI. When Local AI is selected, the browser connects directly to this engine on the user's computer. The engine connects to Ollama on localhost and performs the controlled build workflow locally.

The model never receives unrestricted filesystem or shell access. It can only produce agent output; the engine validates file paths against `FIREBOX_WORKSPACE`, writes generated files, and runs a fixed allowlist of development commands.

## Local endpoints

- `GET /health` — authenticated health check.
- `POST /api/build` — starts a local build and returns an SSE stream.
- `POST /api/test-ollama` — verifies the configured OpenAI-compatible endpoint and model.

## Security boundary

The engine binds to `127.0.0.1` only. Requests require `Authorization: Bearer <FIREBOX_ENGINE_TOKEN>`. The workspace is configured by `FIREBOX_WORKSPACE`; clients cannot choose arbitrary paths. Generated file paths are normalized and rejected if they escape that directory. Commands are limited to package installation, tests, builds, and preview scripts.

## Windows setup

```powershell
$env:FIREBOX_WORKSPACE = "C:\Users\YourName\FireboxProjects"
$env:FIREBOX_ENGINE_TOKEN = "replace-with-a-long-random-token"
$env:FIREBOX_ENGINE_PORT = "8787"
npm run local-engine
```

The browser settings will use `http://127.0.0.1:8787` and the same token. Ollama remains at `http://127.0.0.1:11434/v1`.

This service is intentionally a local development companion. It is not exposed to the public internet and does not change the Cloud AI deployment.
