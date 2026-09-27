---
source: tests/unit/infrastructure/runtime/server-lifecycle.test.ts
sha256: 2a127df8bb94d6dc3822e1c018a96ba5167e2ee2fd4556dd1092df9038324807
generated_at: 2026-09-27T16:10:21.351192+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/server-lifecycle.test.ts

## Purpose

Unit tests for the three lifecycle helpers (`listenOn`, `closeServer`, `failBoot`) in `server-lifecycle.ts`. Unlike typical unit tests, these exercise **real** sockets on an ephemeral loopback port because the behavior under test is Node's and Express's own — a stub would only restate the implementation.

## Key elements

- **`listenEphemeral()`** — test helper; calls `listenOn(express(), 0, '127.0.0.1')` to bind a throwaway app on a random free port.
- **`portOf(server)`** — test helper; extracts the assigned port from a listening `Server` via `AddressInfo`.
- **`describe('listenOn')`** — asserts the promise resolves with `server.listening === true`, and rejects with `{ code: 'EADDRINUSE' }` when the port is already held.
- **`describe('closeServer')`** — opens a keep-alive HTTP request, then asserts `closeServer` resolves promptly (i.e., it does not block on an idle socket until the keep-alive timeout).
- **`describe('failBoot')`** — asserts that `failBoot` invokes the supplied teardown, then calls `process.exit(1)`; also verifies exit still occurs when the teardown itself rejects.

## Relationships

- **Imports (tested module):** `closeServer`, `failBoot`, `listenOn` from `@infrastructure/runtime/server-lifecycle`.
- **Runtime dependencies:** `express` (to build a minimal app for `listenOn`), `node:http` + `node:net` (for the real socket / keep-alive tests and the `AddressInfo` type).
- **Test framework:** Jest globals (`describe`, `it`, `expect`); `jest.spyOn(process, 'exit')` to intercept the non-zero exit in `failBoot` tests.

## Notes

- The `failBoot` tests replace `process.exit` with a spy that returns `undefined as never`. Forgetting to call `mockRestore()` would leak the spy into subsequent tests.
- The keep-alive test creates its own `http.Agent` and calls `agent.destroy()` **after** the `closeServer` assertion; the agent must be destroyed to avoid an open-handle warning, but only *after* the close resolves so the test can confirm no hang occurred.
- Port `0` is used throughout to guarantee no collision with dev servers or other test files running in parallel.
