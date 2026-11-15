---
source: scripts/testing/run-prism-smoke-test.ts
sha256: a90c68ce118c7feda31943d71b80313dbc881f3e32ae1ba00a3a59d8d98a1fdf
generated_at: 2026-11-14T17:43:19.709360+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-prism-smoke-test.ts

## Purpose

A one-shot contract smoke test (run via `npm run test:prism`) that spawns a Prism mock server against the repo's `openapi.yaml`, polls until it accepts connections, and issues a single GET to prove the spec is complete enough for Prism to generate a 2xx response. It verifies the *document*, not application logic. It deliberately owns the child process it starts so a failed run never leaves a stray server listening.

## Key elements

- **`PORT` / `PROBE`** — Env-overridable listening port (default `4010`) and probe path (default `/`), allowing the test to shift off a busy port or target a different route.
- **`BOOT_TIMEOUT_MS`** (30 s) — Deadline for the mock to become reachable before the run is declared a failure.
- **`prism`** — The `child_process.spawn` handle for `prism mock openapi.yaml --errors --port <PORT>`. `--errors` makes Prism reject spec-violating requests instead of answering. `stdio` is piped (not inherited) so output is buffered and only printed on failure.
- **`stop()`** — Sends `SIGTERM` to the Prism process if it is still running. Wired to both `process.on('exit')` and a `SIGINT` handler (exit code 130) so cleanup happens on every exit path.
- **`finish(code, message)`** — Terminates the script: kills Prism, prints the one-line outcome (and Prism's captured output on failure), then calls `process.exit`.
- **`waitForBoot()`** — Polls `http://127.0.0.1:<PORT><PROBE>` every 250 ms until a response arrives or the deadline passes. Returns the first `Response` (which *is* the test's assertion subject) rather than discarding it.
- **`main()`** — Async wrapper around `waitForBoot` + status check. Wrapped in a function (not top-level `await`) because the package is CommonJS and esbuild rejects top-level await.

## Relationships

- **`scripts/fail-script.ts`** — Provides `failScript`, used as the `.catch()` handler on `main()` to convert an unhandled rejection into a clean non-zero exit with the error message.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT`, used as the `cwd` for the Prism spawn so the spec file resolves regardless of where the script is invoked from.

## Notes

- **Not in the pre-commit gate** — It binds a real TCP port, which would make pre-commit flaky in CI or on a crowded dev machine.
- **Probe route choice** — `/` is selected because it belongs to no API module (survives a `demo:remove` step) and its response body is generated from a `$ref`'d schema, which is the specific spec-completeness property this test claims to validate.
- **Output suppression** — Prism's stdout/stderr are accumulated silently and only flushed when the run fails, keeping the success path to a single line.
- **Exit codes** — `0` on success, `1` on any failure (spawn error, early exit, timeout, non-2xx), `130` on Ctrl-C.
