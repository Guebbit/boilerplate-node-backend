# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

A correctness pass over serialization, seeding, cache invalidation and port allocation, driven by
running this stack against its paired frontend (`boilerplate-vue-frontend`) rather than only against
its own tests.

### ⚠ Breaking

- **API responses now return `id` instead of `_id`, and no longer include `__v`.** This already
  applied to users; it now applies to products, orders and feedback requests, which is what
  `openapi.yaml` always declared. Any consumer reading `_id` off a response must be updated.
- **Host ports moved.** This repo now owns the `3000–3099` block: Umami `8090` → `3080`, docs
  `4173` → `3090`. Update bookmarks, Grafana datasource URLs and any frontend pointing at the old
  Umami origin.
- **`db/migrations/20240101000000-initial-seed-data.js` was replaced** by
  `20240101000000-initial-indexes.js`. A database that already ran the old migration keeps its
  changelog entry; the demo data it inserted is now owned by `db:seed`.
- **`npm run db:cache:clear` now exits `1` when Redis is unreachable** instead of reporting success.
  Any script that ignored its exit code will start failing — correctly.

### Added

- **`id` serialization for every resource.** `applyProductTransform()`, `applyOrderTransform()` and
  `applyFeedbackRequestTransform()` in their respective models, wired through
  `schema.set('toJSON', { virtuals: true, versionKey: false, transform })`, mirroring the existing
  `applyUserTransform`. `applyOrderTransform` also strips the stray `_id` older documents carry on
  embedded order items, and recurses into the embedded product snapshot.
- **Credential-scoped repository finders.** `findByIdWithCredentials` / `findOneWithCredentials` in
  `src/repositories/users.ts` — the only sanctioned way to re-select `password` and `tokens`. The
  `+password +tokens` selector is written down exactly once.
- **`clearCache()`** in `src/core/adapters/cache.ts` — `SCAN` + `DEL` over `<CACHE_PREFIX>:*`,
  deliberately not `FLUSHALL`, so a Redis shared with another app or environment is untouched.
  Returns `{ deleted, reachable }`.
- **`resolveCacheTtl()`** in the same adapter, plus `NODE_REDIS_CACHE_DEV_TTL_MAX` (default `30`s):
  outside production, response-cache TTLs are clamped. `0` disables the cap; a malformed value falls
  back to the default rather than caching forever. Production is never clamped.
- **`db/cache-clear.ts`** and `npm run db:cache:clear` — the manual escape hatch after `mongosh`
  surgery.
- **`db/run-script.ts`** — a shared `runScript(main, cleanup)` for `db/` entry points: awaits the
  body, logs a real error and sets `process.exitCode = 1` on throw, and runs `cleanup` in a
  `finally` so connections close on both paths. Uses `process.exitCode` rather than
  `process.exit()`, so Node drains stdout instead of truncating the line that explains the failure.
- **`db/migrations/20240101000000-initial-indexes.js`** — indexes only (users: `email`,
  `tokens.token`, `deletedAt`; products: `createdAt`, `active+deletedAt`; orders: `userId+createdAt`,
  `email`), dropped in `down()`. `createIndex` is idempotent, so re-running is a no-op.
- **`db:bootstrap`** (`db:migrate:up && db:seed`), wired into the compose `app` command ahead of the
  server, so a fresh `compose up` produces a populated, browsable demo.
- **`:host` script variants** for working outside containers: `dev:host`, `db:migrate:up:host`,
  `db:migrate:down:host`, `db:migrate:status:host`, `db:seed:host`, `db:seed:reset:host`,
  `db:cache:clear:host`, `db:bootstrap:host`. Added `cross-env` as a devDependency so they work on
  Windows.
- **A `mongosh ping` healthcheck** on the compose `database` service; `app` now waits on
  `condition: service_healthy`, because boot-time bootstrapping needs Mongo actually accepting
  connections rather than merely started.
- **Tests — 284 → 297.** `tests/unit/models/{users,products,orders,feedback-requests}.test.ts`
  (serialization regression guards, on both `.toJSON()` output and lean/aggregate reads),
  `tests/unit/core/adapters/cache.test.ts` (six cases over `clearCache`, including the refused
  connection that is the regression gate for the silent-success bug), and
  `tests/unit/db/run-script.test.ts` (seven cases, including that cleanup still runs when the body
  throws).
- **Documentation** — README sections on seeding and the response cache, a _Running on the host_
  table pairing each script with its `:host` twin, `docs/tools/redis-cache.md` _Writes that bypass
  the API_, and `docs/tools/email-and-rendering.md` _Using a hosted provider_.

### Changed

- **`db/seeds/index.ts` is now idempotent and safe to run on every boot.** Each fixture is looked up
  by its fixed `_id` and created only when missing. It goes through the repositories rather than the
  raw driver, so the model's pre-save hook still hashes passwords. It **refuses to run when
  `NODE_ENV=production`**, and it calls `clearCache()` only when it actually created something, so
  the common no-op boot does not churn Redis.
- **`gino@pino.it`'s seed password is now the known plaintext `password`**, hashed by the model hook,
  instead of an opaque bcrypt hash with lost plaintext. Both seed credentials are documented in the
  README: `root@root.it` / `rootroot` and `gino@pino.it` / `password`.
- **`clearCache()` reports reachability rather than swallowing everything.** It still never rejects —
  fail-open is preserved — but fail-open is now a decision each caller makes: the seeder reads
  `reachable` and ignores it for control flow (only choosing which line to log), while
  `db/cache-clear.ts` throws on `!reachable`. `reachable` is `true` when caching is disabled, since
  there is nothing to reach and nothing cached to go stale.
- **The dev TTL cap is applied where the TTL enters the system** (the `setCache` middleware), so
  `Cache-Control: max-age` advertises the lifetime the server will actually honour instead of the
  route's declared one. Routes keep declaring their real production TTLs.
- **`scripts/gen-asyncapi-types.ts` is now the shared implementation**, byte-identical to the
  frontend's copy. It emits a superset — modelina payload interfaces, `I<MessageName>` aliases, the
  `<NAMESPACE>_CHANNELS` constant objects with their `T<Namespace>Channel` unions (what this repo
  imports), and `REALTIME_SSE_EVENT_NAMES` / `ISseEventPayloadMap` (what the frontend imports).
  Channel namespaces are **discovered** from the contract rather than hardcoded, so a new prefix
  generates its own constant group with no script change. The output path comes from `--out`.
- **YAML parsing moved from `js-yaml` to `yaml`**, matching the frontend.
- **`.env` / `.env-example` stay container-first** by design; the README quickstart now leads with
  `podman compose up` and says plainly that the stack is container-first and why.
- **`.gitignore`** no longer excludes `.env-example` (`!.env-example` after the `.env*` rule).
- **`eslint.config.ts` and `.prettierignore`** now ignore `src/types/asyncapi.ts`, which is generated
  output.
- **`src/middlewares/auth-jwt.ts`**'s barrel comment now describes what the module is — the front
  door every consumer imports — rather than calling itself a backward-compatibility shim.

### Fixed

- **`GET /products`, `GET /products/{id}` and `GET /orders` returned raw `_id` and `__v`**, so the
  paired frontend's `item.id` reads came back `undefined` and detail links resolved to
  `/products/undefined`.
- **`GET /users` leaked `password` and `tokens`.** Closed by both mechanisms below.
- **The seeder could leave the response cache serving pre-seed data** for the rest of the TTL — up to
  an hour on the old default. `db:seed` now invalidates, and the dev cap bounds the damage from any
  writer nobody has enumerated.
- **`npm run db:cache:clear` reported success with Redis down.** It printed
  `Cache cleared: 0 keys removed.` and exited `0` — indistinguishable from a genuinely empty cache —
  so the documented recovery tool silently no-opped. It now logs
  `Redis is unreachable — the cache was NOT cleared` and exits `1`.
- **`db/` scripts could hang instead of exiting.** A throw skipped `connection.close()` and
  `stopCache()`, leaking both sockets. Teardown moved into `runScript`'s `finally`.
- **`.catch((error) => { throw error; })` in both `db/` entry points** was a no-op that produced the
  same unhandled rejection as having no `.catch` at all. Removed in favour of `runScript`.
- **`adminUpdateById`'s "changes the password" test had been passing vacuously** — it read the
  password back through a finder that no longer selects it. Five tests moved onto the credential
  finders; this one started actually asserting.

### Removed

- **The commented-out SendGrid transport block** in `src/core/adapters/mailer.ts`. It could not have
  compiled if uncommented: `nodemailer-sendgrid-transport` was never a dependency,
  `sendgridTransport` was never imported, and `NODE_APIKEY_SENDGRID` appeared nowhere else in the
  repository. The affordance moved to `docs/tools/email-and-rendering.md`, which records what is
  actually true — SendGrid, Mailgun, SES, Postmark, Resend and Brevo all run SMTP relays, so the
  existing adapter reaches them from `.env` alone, with no code change.
- **`db/migrations/20240101000000-initial-seed-data.js`** — seed data as a migration is a category
  error: it cannot be re-run to refresh a development database, and it hand-rolled `hash(…, 12)`
  instead of going through the schema's pre-save hook. Migrations now own schema, `db:seed` owns
  data.
- **`js-yaml` and `@types/js-yaml`** — no remaining consumer.

### Security

- **`select: false` on `password` and `tokens`** in `src/models/users.ts`, so the fields are absent
  unless a query explicitly asks — including on paths nobody has audited yet.
- **An allowlist boundary in `applyUserTransform`**, returning exactly the OpenAPI `User` properties.
  `active` is derived from `deletedAt`. New model fields are invisible until deliberately exposed.
- **A regression guard asserting both mechanisms independently**: `JSON.stringify(payload)` must
  contain neither `password` nor `tokens` nor `$2b$`.
- Auditing the other three models for the same over-serialization class found nothing — unlike
  `User`, they carry no credential-shaped fields, and their OpenAPI schemas line up with what the
  models store.

### Known issues

- The two `openapi.yaml` copies (this repo and the frontend's) are hand-synced and currently
  divergent; the frontend's is missing `/observability/load-test`.
- Uploaded images 404: files are written to `public/images/`, but nothing mounts them.
- `.env-example`'s JWT secrets are literal placeholders that `validateRequiredEnvironment` accepts,
  since it only checks for non-emptiness.
- The `:host` scripts hardcode the database name, ignoring `NODE_MONGODB_NAME`.
