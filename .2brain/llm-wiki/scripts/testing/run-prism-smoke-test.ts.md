---
source: scripts/testing/run-prism-smoke-test.ts
sha256: fefa90054e63b05d43c7933fcb0c0d0622eda2d25abc970626dedfbbd153740f
generated_at: 2026-10-14T07:33:38.102204+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-prism-smoke-test.ts

## Purpose

A standalone smoke test (invoked via `npm run test:prism`) that spawns a Prism mock server against `openapi.yaml`, polls a single probe route until it gets a 2xx, and exits. It validates that the OpenAPI document is complete enough for Prism to parse and serve—testing the *contract*, not application logic. It deliberately sits outside the pre-commit gate because it binds a real TCP port and must own the child process lifecycle.

## Key elements

- **`REPO_ROOT`** — resolved from `__dirname/../..`; used as `cwd` so Prism finds `openapi.yaml`.
- **`PORT`** — mock server listen port; defaults to `4010`, overridable via `PRISM_PORT` env var.
- **`PROBE`** — the single route to hit; defaults to `/products`, overridable via `PRISM_PROBE`.
- **`BOOT_TIMEOUT_MS`** — 30 s ceiling for the readiness poll.
- **`prism`** (child process) — `prism mock openapi.yaml --errors --port <PORT>`; `--errors` makes Prism 4xx on spec-violating requests rather than answering with defaults.
- **`stop()`** — sends `SIGTERM` to the Prism child if still running; wired to `process.on('exit')` so it fires on any termination path.
- **`finish(code, message)`** — terminal helper: calls `stop()`, prints the outcome (plus captured Prism stdout/stderr on failure), and `process.exit`s.
- **`waitForBoot()`** — polls `GET http://127.0.0.1:<PORT><PROBE>` every 250 ms until a response arrives or the deadline lapses; returns the first `Response` (which is also the test assertion).
- **`main()`** — async entry point (wrapped in a function because the package is CommonJS and esbuild rejects top-level `await`); calls `waitForBoot`, checks `response.ok`, then `finish`.

## Relationships

- **`github/workflows/schemathesis.yml`** — sibling CI job in the contract-testing pipeline; this script is the lightweight "can the spec even be mocked?" gate that runs before (or independently of) the heavier Schemathesis scenario tests.
- **`tests/cluster/support/cluster.ts` / `tests/cluster/support/redis.ts`** — no direct import; they share the same `openapi.yaml` contract that this script validates at the mock level, while the cluster tests exercise it against a real backend.

## Notes

- **Stdio is piped, not inherited.** Prism's stdout/stderr are captured into `output` and only printed on failure—keeps CI logs clean on green runs.
- **Exit code 130 on ^C.** Follows the shell `128 + SIGINT` convention; the `exit` hook still fires, so Prism is killed.
- **Not a Jest/Vitest test.** It's a plain `tsx` script with a non-zero `process.exit`; the npm script is the integration point, not a test-runner config.
- **Port collision safety.** If `4010` is taken, set `PRISM_PORT` rather than editing the file.
- **`--errors` flag matters.** Without it, Prism would happily return generated (possibly wrong) responses for malformed specs, masking the very incompleteness the test is meant to catch.
