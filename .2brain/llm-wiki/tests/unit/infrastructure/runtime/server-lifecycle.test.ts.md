---
source: tests/unit/infrastructure/runtime/server-lifecycle.test.ts
sha256: 2a127df8bb94d6dc3822e1c018a96ba5167e2ee2fd4556dd1092df9038324807
generated_at: 2026-11-08T10:24:04.315173+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/server-lifecycle.test.ts

## Purpose

Integration-style unit tests for `server-lifecycle.ts`. Verifies that `listenOn`, `closeServer`, and `failBoot` behave correctly against **real** sockets on an ephemeral loopback port (127.0.0.1), because the behaviour under test is Node's and Express's own socket handling, which a stub would only restate.

## Key elements

- **`listenEphemeral`** – helper that binds a bare `express()` app to port `0` on `127.0.0.1` via `listenOn`; returns the `Server`.
- **`portOf`** – helper that casts `server.address()` to `AddressInfo` and returns the numeric port.
- **`describe('listenOn')`** – two tests: (1) resolves with `server.listening === true`; (2) rejects with `{ code: 'EADDRINUSE' }` when the target port is already held.
- **`describe('closeServer')`** – opens a keep-alive HTTP GET against the server, then asserts `closeServer` resolves without hanging on the idle socket.
- **`describe('failBoot')`** – two tests: (1) calls the supplied teardown then `process.exit(1)`; (2) still calls `process.exit(1)` when the teardown itself rejects.

## Relationships

- **`src/infrastructure/runtime/server-lifecycle.ts`** – the module under test; this file imports its three public exports (`listenOn`, `closeServer`, `failBoot`) and exercises each.

## Notes

- **No socket mocks.** Tests deliberately use real `http` sockets on `127.0.0.1` so that Node/Express keep-alive and `EADDRINUSE` semantics are exercised for real.
- **`process.exit` is spied on** (`jest.spyOn(process, 'exit').mockImplementation(() => undefined as never)`) in the `failBoot` tests to prevent the test runner from terminating; always paired with `exit.mockRestore()`.
- **Keep-alive test is order-sensitive.** The `http.Agent` with `keepAlive: true` must be destroyed (`agent.destroy()`) *after* `closeServer` resolves; otherwise the socket may linger. The test comment warns it "would hang until the keep-alive timeout" if `closeServer` left the idle socket open.
