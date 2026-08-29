# src/app/demo.ts

## Purpose

HTTP control surface for the demo profile, mounted only when `NODE_DEMO=true` (i.e. under `npm run demo`). Exposes two unauthenticated routes that the frontend e2e suite calls to obtain a deterministic starting state (`POST /__demo/reset`) and to read simulated outbound email (`GET /__demo/emails`).

## Key elements

- **`runDemoSeed(reset: boolean)`** – Drops the in-memory database (when `reset` is true), then runs every enabled module's `seeds()` in parallel, and finally clears the demo outbox.
- **`installDemo(app: Express)`** – Registers the two `/__demo/*` routes on an Express instance.
- **`isDemoMode`** – Re-exported from `@infrastructure/adapters/demo-outbox` for downstream consumers.

## Relationships

- **`src/modules.ts`** – Imports `enabledModules`; `runDemoSeed` iterates that list to collect and invoke each module's optional `seeds()`.
- **`src/infrastructure/adapters/demo-outbox.ts`** – Imports `clearDemoOutbox` / `readDemoOutbox` for the reset and email-reading routes; source of the re-exported `isDemoMode`.
- **`src/infrastructure/runtime/database.ts`** – Imports `connection` to call `dropDatabase()` during reset.
- **`src/infrastructure/adapters/logger.ts`** – Imports `logger` to log a `demo reset failed` error on the 500 path.
- **`package.json`** – The `npm run demo` script (which sets `NODE_DEMO=true`) is the only context in which this module is mounted.

## Notes

- Routes are deliberately unauthenticated; the profile only ever binds beside an in-memory database created seconds earlier by the demo script, so there is no external exposure to protect.
- The demo profile runs with the cache disabled, so `runDemoSeed` skips the cache flush that the CLI counterpart (`db/demo/index.ts --reset`) performs.
- `runDemoSeed(false)` is the first-boot path: it seeds without dropping, leaving whatever schema the runtime created intact.
