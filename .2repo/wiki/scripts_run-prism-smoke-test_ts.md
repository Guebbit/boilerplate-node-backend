# scripts/run-prism-smoke-test.ts

## Purpose

Boots a Prism mock server against `openapi.yaml` and issues a single GET to a probe endpoint to confirm the spec is complete enough to mock. It is a contract smoke test (verifying the OpenAPI document, not application logic), run via `npm run test:prism`. It owns the lifecycle of the child `prism` process so a failed probe never leaves a dangling server.

## Key elements

- **`prism` (child process)** — Spawns `prism mock openapi.yaml --errors --port <PORT>` from the repo root. stdout/stderr are piped and accumulated into `output` for failure diagnostics.
- **`stop()`** — Sends `SIGTERM` to the prism process if it is still running. Registered on both `process.on('exit')` and `SIGINT` (exits with code 130).
- **`finish(code, message)`** — Always calls `stop()`, logs the result (and captured server output on failure), then calls `process.exit(code)`.
- **`waitForBoot()`** — Polls `http://127.0.0.1:<PORT><PROBE>` every 250 ms until a response arrives or a 30 s deadline elapses. Avoids a hard-coded sleep.
- **`main()`** — Awaits boot, issues the real probe GET, and calls `finish` with success (2xx) or failure.
- **Configurable env vars** — `PRISM_PORT` (default `4010`) and `PRISM_PROBE` (default `/products`).

## Relationships

No direct imports or code-level interactions with the listed graph neighbors (`src/modules/account/module.ts`, `tests/cluster/support/cluster.ts`) are present in this file. The script's only external dependency is the `openapi.yaml` file at the repo root and the `prism` CLI binary (from `@stoplight/prism-cli`).

## Notes

- **CommonJS constraint:** The package is CJS, where esbuild rejects top-level `await`. The entire flow is therefore wrapped in an async `main()` called with `void main()`.
- **Piped (not inherited) stdio:** Prism's stdout/stderr are captured into a buffer so that, on failure, the accumulated output is printed alongside the error message. With `inherit`, that diagnostic context would be lost.
- **Not in the pre-commit gate:** The script binds a real TCP port and spawns a long-lived process, so it is deliberately excluded from fast pre-commit checks.
- **Process ownership:** The script guarantees cleanup on every exit path (success, failure, `^C`, unexpected throw) so no orphaned prism server remains.
