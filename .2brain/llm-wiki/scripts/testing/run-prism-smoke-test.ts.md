---
source: scripts/testing/run-prism-smoke-test.ts
sha256: 990af01d92fcb0dd34975ed176574f40d2eeec0fef7883db22141ed89a820cf3
generated_at: 2026-09-23T17:32:33.299044+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-prism-smoke-test.ts

## Purpose

Boots the `prism` mock server against the repo's `openapi.yaml`, then issues a single HTTP GET to confirm the server parsed the spec and can serve examples. It validates the **contract document itself** (completeness, parseability) rather than any application logic. Run via `npm run test:prism`; it is deliberately kept out of the pre-commit gate because it binds a real port.

## Key elements

- **`REPO_ROOT`** — resolved to two levels up from the script so `prism` can find `openapi.yaml`.
- **`PORT`** (default `4010`, overridable via `PRISM_PORT`) — the port the mock listens on.
- **`PROBE`** (default `/products`, overridable via `PRISM_PROBE`) — the single route whose 2xx response constitutes the pass/fail check.
- **`BOOT_TIMEOUT_MS`** (`30_000`) — polling deadline for server readiness.
- **`prism`** (child process) — spawned with `['mock', 'openapi.yaml', '--errors', '--port', …]`; `stdout`/`stderr` are piped into a shared `output` buffer for diagnostic output on failure.
- **`stop()`** — kills the child process with `SIGTERM` if it is still running; registered on both `process.on('exit')` and `SIGINT` so a failed curl or `^C` never leaves an orphan.
- **`finish(code, message)`** — calls `stop()`, logs the result (and the captured server output on failure), then `process.exit`.
- **`waitForBoot()`** — polls `fetch` every 250 ms until the probe URL responds or the deadline passes; the _first_ successful response **is** the assertion, so it is returned rather than discarded.
- **`main()`** — orchestrates `waitForBoot` → status check → `finish`; invoked as `void main()` because the package is CommonJS and esbuild rejects top-level `await`.

## Relationships

- **`github/workflows/schemathesis.yml`** — both are part of the repository's contract-testing pipeline. Schemathesis generates dynamic test cases from the same `openapi.yaml`; this script performs the lighter "can the spec even be parsed and served?" check. They complement rather than overlap.
- **`src/modules/account/module.ts`** — source modules like this one are the origin of the routes documented in `openapi.yaml`. The smoke test transitively verifies that the spec (derived from such modules) is well-formed enough for Prism to serve.
- **`tests/cluster/support/cluster.ts`** — shares the repo's test-infrastructure conventions (spawn-and-teardown lifecycle, port configuration). No direct code import exists between the two.

## Notes

- The script is **not idempotent on a busy port** by default; set `PRISM_PORT` if `4010` is already bound.
- `stdio` uses `'pipe'` (not `'inherit'`) specifically so the readiness poll can fail into the `output` buffer; Prism's log is only printed to the console on a non-zero exit.
- Because the package is CommonJS, the entire async flow lives inside `main()` rather than at module top level — do not refactor to top-level `await` without switching to ESM.
- The probe path (`/products`) is hard-coded as a default; if the spec's route set changes, update `PRISM_PROBE` or the default to match a route that actually exists in `openapi.yaml`.
