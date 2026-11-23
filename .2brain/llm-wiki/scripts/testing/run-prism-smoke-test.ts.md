---
source: scripts/testing/run-prism-smoke-test.ts
source_sha256: 6409f1305e2127700ae7a9fa28de87a5bdd7bedd25462aafc86c768b0b4c7231
context_sha256: 11bfc73b07b11f84ad93f441b27715a64fa979fec9ffb529f78301beaba353fb
generated_at: 2026-11-22T02:19:30.907293+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/testing/run-prism-smoke-test.ts

## Purpose
A smoke test of the OpenAPI contract, run via `npm run test:prism`. It boots Prism (`prism mock openapi.yaml`), probes one route, and passes if Prism answers with a 2xx. Because Prism serves the spec's own examples, a green run means the document is complete enough to mock. It is kept out of the pre-commit gate because it binds a real port.

## Key elements
- `PORT`: from `PRISM_PORT`, default `4010`.
- `PROBE`: route requested, from `PRISM_PROBE`, default `/`. `/` belongs to no module, so it survives `demo:remove`. It is also the route whose body Prism generates from a `$ref`'d schema.
- `BOOT_TIMEOUT_MS`: 30 seconds for Prism to become answerable.
- `prism`: child process spawned with `mock openapi.yaml --errors --port <PORT>`. It runs with `cwd: REPO_ROOT` and piped stdout/stderr. `--errors` makes Prism refuse requests that break the spec.
- `output`: buffer of everything Prism printed. It is shown only on failure.
- `stop()`: sends `SIGTERM` to Prism if it is still running. It is registered on the process `exit` event. `SIGINT` exits with code 130, which triggers that hook.
- `finish(code, message)`: stops Prism, logs the outcome (`info` on success, `error` on failure, plus Prism's output on failure), and exits.
- `waitForBoot()`: polls `fetch` against `http://127.0.0.1:<PORT><PROBE>` every 250 ms until it gets a response. It returns that first response instead of probing again. It calls `finish(1, …)` if the deadline passes.
- `main()`: awaits `waitForBoot()`, then calls `finish(1, …)` for a non-2xx response or `finish(0, …)` for a 2xx.

## Relationships
- `scripts/modules-on-disk.ts`: supplies `REPO_ROOT`, used as the spawned Prism process's working directory.
- `scripts/fail-script.ts`: supplies `failScript`, attached as the `.catch` handler on `main()` for unexpected errors.

## Notes
- Failure paths: a spawn error (it suggests checking that `@stoplight/prism-cli` is installed), Prism exiting with a non-zero code before the probe answers, a boot timeout, or a non-2xx probe response.
- The `exit` handler on `prism` only treats a non-zero exit code as failure.
- `main` is wrapped in a function rather than using top-level await, because the package is CommonJS and esbuild rejects top-level await there.
- The script owns the Prism process, so a failed probe cannot leave a server running.
- The timeout message hardcodes "30s" rather than using `BOOT_TIMEOUT_MS`.
