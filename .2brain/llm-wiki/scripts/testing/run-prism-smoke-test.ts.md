---
source: scripts/testing/run-prism-smoke-test.ts
sha256: 0ba78e4661e70d3663933f91944ef03f6a8400553cadaf40e1dd7f9df02399d7
generated_at: 2026-10-15T09:48:45.302945+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-prism-smoke-test.ts

## Purpose

A standalone smoke test (`npm run test:prism`) that boots the Prism mock server against `openapi.yaml` and issues a single HTTP request to prove the spec is complete enough for Prism to parse and serve. It validates the *contract document*, not application logic, and is excluded from the pre-commit gate because it binds a real port.

## Key elements

- **`prism`** (spawned child process) — runs `prism mock openapi.yaml --errors --port <PORT>` with piped stdio; `--errors` makes Prism reject spec-violating requests rather than answering them.
- **`PORT`** — listen port, default `4010`, overridable via `PRISM_PORT` env to avoid port collisions.
- **`PROBE`** — the single URL path requested as the smoke check, default `/`, overridable via `PRISM_PROBE`. Chosen because it belongs to no module and its response body is generated from a `$ref`'d schema.
- **`waitForBoot()`** — polls `http://127.0.0.1:${PORT}${PROBE}` every 250 ms until a response arrives or the 30 s deadline elapses; returns the first successful `Response` (which doubles as the smoke assertion).
- **`stop()`** — kills the Prism child with `SIGTERM` if still alive; registered on `process.on('exit')` and invoked by `finish()`.
- **`finish(code, message)`** — stops Prism, logs the one-line outcome, dumps captured server output on failure, and calls `process.exit(code)`.
- **`main()`** — async wrapper (avoids top-level `await`, which esbuild rejects in this CommonJS package) that calls `waitForBoot` and checks for a 2xx status.

## Relationships

- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, used as the working directory for the spawned Prism process so `openapi.yaml` resolves correctly regardless of where the script is invoked from.
- **`github/workflows/schemathesis.yml`** — CI workflow in the same contract-testing area; this script is the local/manual counterpart to the workflow's automated contract checks.

## Notes

- The script **owns** the Prism process it spawns: it installs `exit` and `SIGINT` handlers so a failed `curl` (or `^C`) never leaves a zombie server holding the port.
- `stdio` is set to `['ignore', 'pipe', 'pipe']` rather than `inherit`; Prism's combined stdout+stderr is buffered into `output` and only printed when the run fails.
- The `SIGINT` handler exits with code **130** (128 + SIGINT) to follow shell convention, but the `exit` hook still fires, guaranteeing cleanup.
- The probe path `/` is deliberately chosen: it is the one route whose response body Prism generates from a `$ref`'d schema, which is the specific claim this test makes about spec completeness.
