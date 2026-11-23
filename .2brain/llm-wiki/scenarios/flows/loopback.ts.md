---
source: scenarios/flows/loopback.ts
generated_at: 2026-11-22T01:43:24.354804+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/flows/loopback.ts

## Purpose
Provides a throwaway HTTP listener for driving the Express app over real HTTP without publishing a port. It is used when the app is not otherwise listening: the demo profile drives its flows before `src/app.ts` binds `NODE_PORT`, and `scenarios/apply.ts` has no server at all. Because `app.listen()` creates a fresh `http.Server` on each call, it never collides with the real server.

## Key elements
- `withLoopbackServer<T>(app, drive)`: the only export.
  - Calls `app.listen(0, '127.0.0.1', ...)`. Port `0` asks the OS for a free port, and `127.0.0.1` keeps the server off other interfaces.
  - Reads the assigned port from `server.address()` and builds `baseUrl` as `http://127.0.0.1:<port>`.
  - Runs `drive(baseUrl)`, then closes the server and returns whatever `drive` resolved to.
  - If `drive` rejects, it still closes the server, then rethrows the original error.
  - If the server emits an `error` event before it is listening, the returned promise rejects.

## Relationships
- `scenarios/index.ts` is a graph neighbor of this file. The file itself names only the demo profile flow and `scenarios/apply.ts` as callers (neither is a graph neighbor), so any use from `scenarios/index.ts` is not visible here.
- `package.json` is a neighbor, but the file has no visible interaction with it. It imports only types: `Express` from `express` and `AddressInfo` from `node:net`.

## Notes
- The server serves unauthenticated `/__test/*` routes in the demo profile. This is why it binds only to loopback and lives only for the length of one seed.
- The `address()` result is cast to `AddressInfo`. This is safe because `listen(0, host)` never produces a UNIX socket.
- Cleanup is awaited on both the success and failure paths, so `close()` finishes before the result or error propagates.
