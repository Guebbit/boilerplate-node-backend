---
source: scenarios/run-server.ts
source_sha256: 6508c873bc2201363c324edb69b539ef40469235dd08809f8605864df6a4784c
context_sha256: a72229169f51c8a7e343603f499dd012654abdb25982572114160133b2ef953d
generated_at: 2026-11-22T01:45:26.733071+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/run-server.ts

## Purpose
Entry point for the demo profile (`npm run demo`): boots the real API against a disposable in-memory MongoDB, seeds it from the `shop` scenario, and serves on `NODE_PORT`. No Docker, Redis or broker is needed (cache and queue run `disabled`). The paired frontend's dev server and e2e suite run against it instead of a hand-written mock.

## Key elements
- **`DOTENV`**: `.env` parsed in isolation with `node:util`'s `parseEnv`, with no `process.env` write. It is empty when no `.env` exists.
- **`shellValue(key)`**: returns a variable's value only if the shell set it. A value equal to the `.env` copy doesn't count, because `development-doubles` has already loaded `.env` into `process.env`.
- **`REQUIRED_DEFAULTS`**: throwaway values so a bare checkout (such as a CI runner) can boot. They cover:
  - `NODE_ENV`
  - a loopback `NODE_HOST`
  - public token secrets
  - PII, TOTP and webhook encryption keys
  - a known payment webhook secret
  - SMTP sender and legal/VAT/timezone values
  - `NODE_CORS_ORIGIN` (`.env`'s value, else ports 8080 and 8085)
  - the spread `DEMO_BANK_TRANSFER`
- **`FORCED_ABSENT`**: Redis and RabbitMQ variables, blanked to `''` rather than deleted so `dotenv` can't refill them.
- **`FORCED_MAIL_TRANSPORT`** (`'outbox'`): always overrides the mail transport, so `GET /__test/emails` keeps working.
- **`waitUntilListening(port)`**: polls `GET /` every 100 ms and gives up after 60 s. A successful response means seeding has finished, because `createApp().start()` seeds before listening.
- **Boot sequence**: calls `startEphemeralMongo({ startInProcess: startInProcessMongod })`, then:
  - registers `SIGTERM`/`SIGINT` handlers that call `mongo.stop()` and exit 0 even if the stop fails
  - calls `installEnvironment(...)` with the merged defaults, forced-absent keys, `SCRIPTED_RATE_LIMITS` and the forced mail transport
  - sets the database name (this part is cut off in the supplied source)

## Relationships
- `./support/development-doubles`: imported first. It loads `.env` and registers the doubles, and `shellValue` reads what it left in the process environment.
- `@infrastructure/runtime/mongoose-boot`: imported before any model loads, since Mongoose defaults are read at schema build.
- `@infrastructure/config/store`: `installEnvironment` writes the final environment into the config store, which reads the process environment only once. `currentEnvironment` is also imported.
- `./support/ephemeral-mongo` and `./support/ephemeral-mongod`: provide `startEphemeralMongo` and the in-process mongod starter. The external-Mongo path is selected with `NODE_TEST_MONGO_URI`.
- `./support/demo-clock`: `installDemoClock` and `registerDemoClock` are imported.
- `./rate-limits`: supplies `DEMO_BANK_TRANSFER` (merged into defaults) and `SCRIPTED_RATE_LIMITS` (overrides that only a shell value beats).
- `src/infrastructure/adapters/logger.ts`: a graph neighbor, but the visible portion of the file does not use it.

## Notes
- The environment is installed into the config store, not just the process environment, because the store reads it only once.
- With `NODE_TEST_MONGO_URI`, the shop persists across restarts and several instances share one database. In-memory instances each own theirs. Don't mix the two by accident.
- `NODE_HOST` defaults to `127.0.0.1` because the profile uses public secrets and its control surface can wipe the database. Override with `NODE_HOST=0.0.0.0` only deliberately.
- Run several instances side by side with different `NODE_PORT` values, e.g. `NODE_PORT=3101 npm run demo`.
- The header says the app is built with an extension from `./support/demo` that mounts the control surface and builds the first scenario.
