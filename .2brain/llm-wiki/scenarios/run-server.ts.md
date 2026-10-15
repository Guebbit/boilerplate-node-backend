---
source: scenarios/run-server.ts
sha256: 4907be607d15760800eff8cec867fcbd572c8aa21c1e41b5e65b0cf05d315961
generated_at: 2026-10-15T09:34:11.498545+00:00
model: ollama:qwen3.8:27b
---

# scenarios/run-server.ts

## Purpose

Entry point for the **demo profile** (`npm run demo`): boots the real application against an ephemeral in-memory MongoDB, seeds it from the `shop` scenario, and serves the API on `NODE_PORT`. It exists so the paired frontend dev server and e2e suite can run against a live, self-contained instance without Docker, Redis, or a message broker.

## Key elements

- **`DOTENV`** — reads `.env` into a plain object via `node:util` `parseEnv` (never `dotenv/config`), isolating the file's values so they can be compared against the shell.
- **`shellValue(key)`** — returns the value only if the *shell* set it (i.e. it differs from what `.env` supplied), otherwise `undefined`.
- **`REQUIRED_DEFAULTS`** — record of env vars the profile fills when neither shell nor `.env` provides one (token secrets, PII/encryption keys, shop config, CORS origins, `DEMO_BANK_TRANSFER`).
- **`FORCED_ABSENT`** — list of external-service vars (Redis, RabbitMQ) blanked to `''` so `dotenv/config` in `src/app.ts` cannot re-hydrate them from `.env`.
- **`FORCED_MAIL_TRANSPORT`** — pins `NODE_MAIL_TRANSPORT` to `'outbox'` so the e2e suite's `GET /__test/emails` always works.
- **`SCRIPTED_RATE_LIMITS`** (from `./rate-limits`) — unconditional rate-limit overrides for the throwaway profile.
- **`waitUntilListening(port)`** — polls `GET /` (60 s timeout) as a readiness signal; valid because `createApp().start()` seeds before opening the socket.
- **Boot sequence (top-level)** — `startEphemeralMongo` → SIGTERM/SIGINT cleanup handlers → `installEnvironment` (defaults + forced-absent + rate-limits + mail transport) → database URI rewrite to `/demo` → `NODE_URL` derivation from the actual port → app creation and listen (truncated).

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/rate-limits.ts` | Imports `DEMO_BANK_TRANSFER` and `SCRIPTED_RATE_LIMITS` for the profile's forced rate-limit and bank-transfer settings. |
| `scenarios/support/demo-clock.ts` | Imports `installDemoClock` / `registerDemoClock` for deterministic time during seeding. |
| `scenarios/support/ephemeral-mongo.ts` | Imports `startEphemeralMongo`; the returned handle is used for the DB URI and for `stop()` on shutdown. |
| `scenarios/support/ephemeral-mongod.ts` | Imports `startInProcessMongod`, passed as the in-process strategy argument to `startEphemeralMongo`. |
| `src/infrastructure/config/store.ts` | Imports `currentEnvironment` and `installEnvironment` to write all profile config into the singleton store before the app reads it. |
| `src/infrastructure/runtime/mongoose-boot.ts` | Side-effect import (no named binding) to apply Mongoose defaults before any schema is built. |

## Notes

- **`.env` is parsed in isolation.** The file deliberately avoids `import 'dotenv/config'` so it can *compare* shell values against file values (`shellValue`) and selectively override. `src/app.ts` still runs `dotenv/config` later, which is why `FORCED_ABSENT` uses `''` rather than `delete` — `dotenv` will not overwrite a key that is already present, even as an empty string.
- **Loopback by default.** `NODE_HOST` defaults to `127.0.0.1` because tokens are signed with a public, hard-coded secret and the control surface can wipe the database. Override with `NODE_HOST=0.0.0.0` only if you need remote access.
- **`NODE_URL` is always derived**, never defaulted to `:3000`. It is built from `NODE_PORT` at runtime so OAuth `redirect_uri` and emailed password-reset links point at the correct instance when multiple ports are running.
- **Multiple instances share an external Mongo.** Pointing `NODE_TEST_MONGO_URI` at a persistent Mongo makes all instances share the `demo` database; the in-memory path does not. The doc comment warns not to combine the two unintentionally.
- **Cleanup on signal.** SIGTERM/SIGINT handlers call `mongo.stop()` to remove the ~200 MB in-process data directory; failure to stop is logged but still exits.
- **`NODE_CORS_ORIGIN`** defaults to both `:8080` (dev server) and `:8085` (e2e preview); a `.env` value is respected so a non-default frontend port isn't silently overridden.
