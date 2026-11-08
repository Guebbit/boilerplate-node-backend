---
source: scripts/testing/run-prism-smoke-test.ts
sha256: b37b5c2fa1fd4a4529aa5e258d2a1494f3ff068f29d643112beec47c6868fd31
generated_at: 2026-11-08T03:03:12.650716+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-prism-smoke-test.ts

## Purpose

Smoke test that boots the Prism mock server against `openapi.yaml` and asserts it returns a 2xx response. It proves the OpenAPI spec is complete enough to be mocked (contract validity), not that the application logic is correct. Invoked via `npm run test:prism`; excluded from the pre-commit gate because it binds a real port.

## Key elements

- **`PORT`** (default `4010`) / **`PROBE`** (default `/`) — overridable via `PRISM_PORT` / `PRISM_PROBE` env vars.
- **`prism`** — spawned child process running `prism mock openapi.yaml --errors --port <PORT>`. Output is captured (not inherited) so it can be printed only on failure.
- **`stop()`** — sends `SIGTERM` to the prism process if still running; registered on `process.on('exit')` and `SIGINT` (exit 130) so the child is never orphaned.
- **`finish(code, message)`** — always-kills prism, prints the one-line outcome (and captured server output on failure), then `process.exit`.
- **`waitForBoot()`** — polls `http://127.0.0.1:<PORT><PROBE>` every 250 ms up to `BOOT_TIMEOUT_MS` (30 s); the first successful `Response` is the test's answer.
- **`main()`** — awaits `waitForBoot`, asserts 2xx, calls `finish`. Wrapped in an async function because the package is CommonJS and esbuild rejects top-level `await`.
- **Top-level `.catch(failScript)`** — unhandled-rejection safety net.

## Relationships

- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` to set the `cwd` of the spawned prism process (so `openapi.yaml` is resolved relative to the repo root regardless of where the script is invoked from).
- **`scripts/fail-script.ts`** — imports `failScript` and passes it as the rejection handler on `main()`, giving a uniform "script crashed" exit path.

## Notes

- The probe route `/` is deliberate: it belongs to no module (survives `demo:remove`) and its body is generated from a `$ref`'d schema, which is the specific spec-completeness claim this test makes.
- `--errors` is passed so Prism *refuses* spec-breaking requests rather than answering them; a non-2xx is therefore a meaningful failure signal.
- Stdio is `['ignore', 'pipe', 'pipe']` (not `inherit`) specifically so output can be withheld on success and dumped on failure.
- The script does not use a fixed sleep; it polls until the port accepts connections or the 30 s deadline elapses.
