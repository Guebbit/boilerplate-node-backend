---
source: scenarios/run-server.ts
sha256: d9971eb57b1cfcceba2f911aade4e07e29d863aa189ed2b91d182a09002bd608
generated_at: 2026-11-08T02:31:39.968165+00:00
model: ollama:qwen3.8:27b
---

# scenarios/run-server.ts

## Purpose
Entry point for the demo profile (`npm run demo`). Boots the real application server against a disposable in-memory MongoDB (or an external Mongo via `NODE_TEST_MONGO_URI`), seeds the `shop` scenario, and listens on `NODE_PORT`. Exists so the paired frontend dev server and e2e suite can run against the actual API without Docker, Redis, or a message broker.

## Key elements

- **`DOTENV`** — `.env` parsed in isolation via `node:util` `parseEnv` (no `process.env` write). Used to distinguish shell-set values from file-supplied ones.
- **`shellValue(key)`** — Returns a key's value only if the shell set it to something *different* from the `.env` copy; prevents a stale `.env` from masquerading as a deliberate override.
- **`REQUIRED_DEFAULTS`** — Fallback env values (host, token secrets, PII/TOTP keys, webhook secret, SMTP sender, legal/ VAT fields, CORS origins) so a bare checkout boots. Shell values always win.
- **`FORCED_ABSENT`** — Redis and RabbitMQ keys blanked to `''` to defeat both the shell *and* the later `dotenv/config` load inside `src/app.ts`.
- **`FORCED_MAIL_TRANSPORT`** — Hard-pins `NODE_MAIL_TRANSPORT` to `'outbox'` so the e2e suite's `GET /__test/emails` endpoint always works regardless of `.env`.
- **`waitUntilListening(port)`** — Polls `GET /` (60 s timeout) as the readiness signal; valid because `createApp().start()` seeds before listening.
- **Top-level boot sequence** — Calls `startEphemeralMongo` → registers SIGTERM/SIGINT handlers (calls `mongo.stop()` then exits) → `installEnvironment(...)` with the full merged config → overrides the database path to `/demo` → derives `NODE_URL` from the actual port → installs the demo clock → registers the `./support/demo` extension → starts the app.

## Relationships

- **`scenarios/rate-limits.ts`** — Imports `DEMO_BANK_TRANSFER` (merged into `REQUIRED_DEFAULTS`) and `SCRIPTED_RATE_LIMITS` (applied as env overrides unless the shell set a different value).
- **`scenarios/support/demo-clock.ts`** — Imports `installDemoClock` / `registerDemoClock` to deterministically advance time for the demo scenario.
- **`scenarios/support/ephemeral-mongo.ts`** — Imports `startEphemeralMongo`; drives the whole boot (its `.then()` callback is the rest of the sequence).
- **`scenarios/support/ephemeral-mongod.ts`** — Imports `startInProcessMongod` as the in-process mongod factory passed to `startEphemeralMongo`.
- **`src/infrastructure/config/store.ts`** — Imports `installEnvironment` (and `currentEnvironment`) to atomically write the merged config before any model or module reads it.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Imported purely for side effects: sets Mongoose defaults before any schema is built.

## Notes

- **Do not `import 'dotenv/config'` here.** The file deliberately avoids it so `REQUIRED_DEFAULTS` and `SCRIPTED_RATE_LIMITS` can override `.env` secrets. The real `dotenv/config` load happens later inside `src/app.ts`; blanking a key to `''` (not deleting it) is the mechanism that survives that later load.
- **Ephemeral Mongo cleanup is signal-driven.** Without the `SIGTERM`/`SIGINT` handler calling `mongo.stop()`, each boot leaves a ~200 MB data directory under the system temp dir. `start-server-and-test` and the frontend shard runner both rely on SIGTERM.
- **Database name is always `/demo`.** The path is rewritten from whatever URI the ephemeral helper returns. This is what makes the external-Mongo path (`NODE_TEST_MONGO_URI`) persist data across restarts; several in-memory instances never shared a database.
- **`NODE_URL` is derived, never defaulted.** A checked-in `.env` typically names port 3000 (single-instance dev); this profile supports multiple ports, so `NODE_URL` is computed from the actual `NODE_PORT` to keep OAuth redirect URIs and email links correct.
- **CORS default includes port 8085.** Without it, the e2e browser on the preview build is blocked by CORS while Node-side calls pass.
