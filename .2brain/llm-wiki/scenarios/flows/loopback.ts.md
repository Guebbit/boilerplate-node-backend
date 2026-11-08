---
source: scenarios/flows/loopback.ts
sha256: a23ad7f80f776f97c0021b3256cb213e3fc498165bf86c459d087180c6b9f80e
generated_at: 2026-11-08T02:29:29.087707+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/loopback.ts

## Purpose

Provides a single helper that binds an Express app to an **ephemeral loopback port**, hands the resolved `baseUrl` to a caller-supplied async function, and tears the server down afterwards. It exists so the demo profile and `scenarios/apply.ts` can exercise the app over real HTTP at moments when no production server is listening, without publishing a port to any other interface.

## Key elements

- **`withLoopbackServer<T>(app, drive): Promise<T>`** (sole export) — Calls `app.listen(0, '127.0.0.1')`, resolves the OS-assigned port, passes `http://127.0.0.1:<port>` to `drive`, then closes the server. The close runs on both the success and error paths of `drive`, and the resolved/rejected value of `drive` is forwarded to the caller.

## Relationships

- **`scenarios/index.ts`** — Sibling module in the same `scenarios/` package; the graph links them as related, indicating `scenarios/index.ts` imports or re-exports the loopback helper (or its sibling flow files) for the scenario runner.
- **`package.json`** — Source of the `express` type dependency used here (type-only import) and the `node:net` `AddressInfo` type.

## Notes

- **Port `0` + `127.0.0.1`** guarantee no port collisions and no external visibility. The server lives only as long as one `drive` call.
- `app.listen()` allocates a **fresh** `http.Server` per invocation, so this never interferes with the long-lived server that `src/app.ts` later binds to `NODE_PORT`.
- The server is closed **before** the result (or error) is propagated back to the caller, guaranteeing no lingering socket.
- `server.address()` is cast to `AddressInfo` because the `string` overload only applies to UNIX sockets, which `listen(0, host)` never produces.
- In the demo profile this server answers **unauthenticated** `/__test/*` routes; it is intentionally a throwaway, not a test double.
