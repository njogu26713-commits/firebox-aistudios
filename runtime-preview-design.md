# Firebox Runtime and Preview Design

## Scope

Firebox will use a project runner to detect each project stack, choose its package manager and start command, allocate an isolated runtime port, install dependencies when required, start the development process, monitor output, and wait for an HTTP health check before reporting readiness.

## Project identity

The runtime key is the authenticated Firebox project ID when available. The local engine uses a sanitized project workspace name as its local key. A runtime record contains project key, workspace path, detected framework, package manager, install command, start command, port, process state, health state, last output, error, and timestamps.

## Lifecycle

`stopped -> detecting -> installing -> starting -> checking -> running` is the successful path. Failures enter `error` with the last process output and a restartable reason. Closing a project marks it idle; an idle timeout may stop the process. Reopening resumes or starts the runtime again.

## Preview contract

The runner returns `{ projectId, projectName, framework, packageManager, port, url, status, healthy, lastOutput, error }`. The browser receives a proxied URL when a gateway exists. The local engine returns a localhost URL only for the local machine. A missing runtime URL is never reported as a running preview.

## Isolation

Each project gets a separate workspace directory, dependency tree, process, and allocated port. The runner must not reuse a process belonging to another project. Production deployments require a sandbox or container boundary in addition to port separation.

## Agent integration

The controlled tools expose `inspect_project`, `install_package`, `run_build`, `start_preview`, and `get_preview_status`. Preview emits state events. Runtime errors are returned as tool results so the Agent can inspect, repair, and retry. Normal source edits reuse the running process and rely on HMR; dependency or configuration changes may restart it.

## Current deployment boundary

Railway currently persists project files but does not host isolated user project processes. The local engine implements the runner first. A production preview gateway must be added around an isolated runtime service before localhost URLs can be exposed to all users.

## Acceptance checks

A project with `package.json` and a supported script reports the detected stack, uses its lockfile-selected manager, starts on a unique port, waits for a successful HTTP response, survives a normal file edit, and reports process output when it fails. Two projects must not share a port or process. Unsupported projects must return a clear stopped/error state rather than a fake ready state.

---

Author: Manus AI
Date: 2026-08-19

## References

No external references were used; this document records the attached Firebox specification and the current repository architecture.

- [1]: https://github.com/njogu26713-commits/firebox-aistudios Firebox AI Studio repository
