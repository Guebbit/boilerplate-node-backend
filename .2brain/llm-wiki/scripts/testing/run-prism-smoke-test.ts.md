---
source: scripts/testing/run-prism-smoke-test.ts
sha256: b37b5c2fa1fd4a4529aa5e258d2a1494f3ff068f29d643112beec47c6868fd31
generated_at: 2026-10-29T01:46:05.844174+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-prism-smoke-test.ts

## Purpose

Smoke test that spawns Prism in mock mode against `openapi.yaml`, polls a single route until it gets a 2xx response, then exits. It proves the OpenAPI document is well-formed enough to be served as a mock, not that the application itself works. Run via `npm run test:prism`; kept out of the pre-commit gate because it binds a real port.

## Key elements

- **`prism`** — child process (`child_process.spawn`) running `prism mock openapi.yaml --errors --port <PORT>`. `--errors` makes Prism reject spec-violating requests rather than answering.
- **`PORT`** (default `4010`) / **`PROBE`** (default `/`) — overridable via `PRISM_PORT` / `PRISM_PROBE` env vars. The probe path `/` was chosen because it survives `demo:remove` and its body is generated from a `$ref`'d schema.
- **`waitForBoot`** — polls `http://127.0.0.1:${PORT}${PROBE}` every 250 ms up to `BOOT_TIMEOUT_MS` (30 s). Returns the first successful `Response`; a connection-refused loop means Prism never came up.
- **`finish(code, message)`** — single exit path: kills Prism, prints the outcome, dumps captured server output on failure, and calls `process.exit`.
- **`stop`** — kills the Prism child if still alive. Registered on `process.on('exit')` so it runs even on unhandled throws or ^C (SIGINT → `exit(130)`).
- **`main`** — wraps the top-level flow in a function (CommonJS package; esbuild rejects top-level `await`). Calls `waitForBoot`, checks `response.ok`, then `finish`.
- **Stdio handling** — `stdio: ['ignore', 'pipe', 'pipe']`; both stdout and stderr are accumulated into `output` and printed only on failure.

## Relationships

- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` so Prism's `cwd` points at the repository root regardless of where the script is launched from.
- **`scripts/fail-script.ts`** — imports `failScript`, used as the `.catch` handler for `main()`. Provides the project-standard unhandled-error exit path.
- **`github/workflows/schemathesis.yml`** — CI workflow that consumes this smoke test (via the `test:prism` npm script) as part of the contract-testing pipeline.

## Notes

- The script **owns** the Prism process: every exit path (success, failure, ^C, unhandled throw) routes through `stop()`, so a failed curl cannot leave an orphaned server bound to the port.
- `PRISM_PORT` exists specifically so a busy port doesn't fail the gate — set it if 4010 is taken.
- The readiness probe doubles as the assertion; the test does not make a second request. A 2xx *is* the pass condition.
- `--errors` flag means Prism will return a non-2xx for requests that violate the spec; the test treats any non-2xx as failure.
- See `docs/tools/contract-testing.md` for the broader contract-testing context.
