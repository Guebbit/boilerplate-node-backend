# scripts/run-prism-smoke-test.ts

## Purpose

Boots the Prism mock server against `openapi.yaml` on a real port and issues a single HTTP probe to confirm the OpenAPI document is complete enough to serve. Run via `npm run test:prism`. It is a contract smoke test (not an app test) and is deliberately kept outside the pre-commit gate because it binds a port and owns a child process.

## Key elements

- **`prism` (spawned child process)** — runs `prism mock openapi.yaml --errors --port <PORT>` from `REPO_ROOT` with `stdio: ['ignore','pipe','pipe']` so output is captured for diagnostics rather than streamed to the terminal.
- **`stop()`** — sends `SIGTERM` to the Prism process if it is still running; registered on `process.exit` and `SIGINT` to guarantee cleanup.
- **`finish(code, message)`** — single exit path: stops the server, logs the message (and captured server output on failure), then calls `process.exit`.
- **`waitForBoot()`** — polls `http://127.0.0.1:<PORT><PROBE>` every 250 ms up to `BOOT_TIMEOUT_MS` (30 s). Returns the **first** successful `Response` rather than discarding it, since that response *is* the assertion.
- **`main()`** — async wrapper around `waitForBoot()` + status check (`response.ok`). Wrapped in a function (not top-level `await`) because the package is CommonJS and esbuild rejects top-level await.
- **Config constants** — `PORT` (env `PRISM_PORT`, default 4010), `PROBE` (env `PRISM_PROBE`, default `/products`), `BOOT_TIMEOUT_MS` (30 000).

## Relationships

No direct import or runtime dependency on the listed graph neighbors is visible in this file. Its only imports are `node:child_process` and `node:path`.

## Notes

- **CommonJS constraint:** the top-level-await guard (`void main()`) is mandatory; removing it will break the build under esbuild.
- **Process ownership:** the script is responsible for killing Prism on every exit path (success, failure, `SIGINT`). A failed `curl`/`fetch` will not leak the child process.
- **Output capture trade-off:** because stdio is `pipe`, Prism logs are invisible in real time during a successful run; they are only printed via `finish()` on failure.
- **Single-probe semantics:** only one HTTP request is made. The first `2xx` response is both the readiness signal *and* the pass assertion—there is no separate "warm-up" request.
- **Excluded from pre-commit:** binding port 4010 makes it unsuitable for the fast, hermetic pre-commit hook.
