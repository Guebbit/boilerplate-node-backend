---
source: scenarios/flows/loopback.ts
sha256: a23ad7f80f776f97c0021b3256cb213e3fc498165bf86c459d087180c6b9f80e
generated_at: 2026-09-23T17:17:57.703624+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/loopback.ts

## Purpose

Provides a helper for driving the Express app over real HTTP on an ephemeral loopback port without publishing a stable port. It exists so callers (the demo-profile flow runner and `scenarios/apply.ts`) can exercise the app via unauthenticated `/__test/*` routes before or without the production server binding `NODE_PORT`, avoiding a half-built shop being visible to the frontend's readiness probe.

## Key elements

- **`withLoopbackServer<T>(app, drive)`** — The sole export. Binds `app` to `127.0.0.1` on an OS-assigned port (`listen(0, …)`), invokes the `drive` callback with the resulting `http://127.0.0.1:<port>` base URL, and guarantees the server is closed before resolving (or rejecting) with `drive`'s result. Returns `Promise<T>` where `T` is whatever `drive` resolves to.

## Relationships

- **`scenarios/index.ts`** — Imports `withLoopbackServer` to execute demo-profile flows against a temporary instance of the app before the real listener starts.
- **`package.json`** — The runtime dependency (`express`) and TypeScript compilation settings that this module's types (`Express`, `AddressInfo`) rely on.

## Notes

- `server.address()` is cast to `AddressInfo` rather than `string`; the string branch (UNIX socket) is impossible when calling `listen(port, host)`, but TypeScript's union type still demands the narrowing.
- The function always closes the server—on success *and* on `drive` rejection—before propagating the outcome, so no dangling socket lingers.
- Because `app.listen()` constructs a new `http.Server` per call, this loopback instance never collides with the production server, even if both are alive briefly.
- The server is intentionally unauthenticated; it only lives for the duration of one seed/flow run.
