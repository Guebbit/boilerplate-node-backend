---
source: src/infrastructure/adapters/config.ts
sha256: 6406f0c30242019f484fd5c4a139829516737c945c65444f371aff05dba638c4
generated_at: 2026-10-01T12:47:32.916938+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/config.ts

## Purpose

Declares the full environment-variable surface for every infrastructure adapter (mail, queue, Redis, images, PDF, anti-abuse). Each adapter gets its own named `defineConfig` block so a misconfiguration names the adapter it belongs to. Validation rules (cross-field checks, environment-specific guards) live inline in each block's `check` callback, meaning a bad value is caught at boot rather than at first use.

## Key elements

- **`MAIL_TRANSPORTS`** — readonly `['smtp', 'log', 'outbox']`; the only valid values for `NODE_MAIL_TRANSPORT`.
- **`mailConfig`** — SMTP host/port/credentials, sender address, and the `NODE_E2E_RUN` safety flag. `check` enforces: all three SMTP credentials present when a host is set; e2e runs may only dial local sinks; transport must be explicitly set in non-relaxed envs; `outbox` is blocked outside dev/test.
- **`mailFilesConfig`** — spool directory, spool retention hours, and the EJS template override directory.
- **`queueConfig`** — RabbitMQ connection (full URL or host/port/user/pass fragments), `NODE_RABBITMQ_ENABLED` kill switch, and the retry policy (`NODE_QUEUE_MAX_ATTEMPTS`, `NODE_QUEUE_RETRY_DELAY_SECONDS`) inherited by every queue.
- **`redisConfig`** — Redis connection (URL or host/port), `NODE_REDIS_CACHE_PREFIX`, and `NODE_REDIS_CACHE_ENABLED` kill switch.
- **`imageConfig`** — pixel ceiling, max/thumbnail dimensions, public output dir, quarantine path and retention hours.
- **`pdfConfig`** — `PUPPETEER_EXECUTABLE_PATH` pointing to the system Chromium binary.
- **`antibotConfig`** — provider selector (`none`/`altcha`/`turnstile`), email policy + allow/deny lists, and per-provider credentials. `check` verifies that the chosen provider's secret/key fields are present and, for altcha, that the secret is ≥ 16 chars.

## Relationships

- **`src/app/config.ts`** — calls into the antibot provider registry at boot to validate `NODE_ANTIBOT_PROVIDER` against the registry's known names; this file is the value source the registry imports.
- **`src/infrastructure/adapters/antibot-providers/index.ts`** — the provider registry; imports `antibotConfig` to read provider name and credentials, and owns the set of valid provider names (the "selector" mentioned in the module doc).
- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** / **`turnstile.ts`** — each reads its credential fields (`NODE_ANTIBOT_ALTCHA_SECRET`, `NODE_ANTIBOT_TURNSTILE_SITE_KEY`, etc.) from `antibotConfig`.
- **`src/infrastructure/adapters/antibot.ts`** — consumes `antibotConfig` for the email policy, allow/deny lists, and provider dispatch.
- **`src/infrastructure/adapters/mailer.ts`** — builds its transport from `mailConfig`.
- **`src/infrastructure/adapters/mail-spool.ts`** — reads `NODE_MAIL_SPOOL_PATH` from `mailFilesConfig`.
- **`src/infrastructure/adapters/queue.ts`** — connects via `queueConfig`; applies the retry policy.
- **`src/infrastructure/adapters/cache.ts`** — connects via `redisConfig`; honours `NODE_REDIS_CACHE_ENABLED` and the key prefix.
- **`src/infrastructure/adapters/image.ts`** / **`image-store.ts`** — enforce limits from `imageConfig`; write to `NODE_QUARANTINE_PATH` / `NODE_PUBLIC_PATH`.
- **`src/infrastructure/adapters/pdf.ts`** — launches the binary named by `pdfConfig.PUPPETEER_EXECUTABLE_PATH`.
- **`src/app/static-assets.ts`** — serves from `NODE_PUBLIC_PATH` defined in `imageConfig`.
- **`scripts/ops/reap-mail-spool.ts`** — reads `NODE_MAIL_SPOOL_RETENTION_HOURS` and `NODE_MAIL_SPOOL_PATH` from `mailFilesConfig`.
- **`scripts/ops/reap-quarantine.ts`** — reads `NODE_QUARANTINE_RETENTION_HOURS` and `NODE_QUARANTINE_PATH` from `imageConfig`.

## Notes

- `NODE_RABBITMQ_URL` and `NODE_REDIS_URL` are full connection strings that **override** the host/port/user/pass fragments; setting both is redundant but the URL wins.
- `NODE_RABBITMQ_PORT` and `NODE_REDIS_PORT` act as presence signals: unset (and no URL) means the adapter is off entirely.
- `NODE_REDIS_CACHE_PREFIX` must differ between staging and production to avoid key collisions on a shared Redis instance.
- The antibot provider name (`NODE_ANTIBOT_PROVIDER`) is stored as plain text here; the set of valid values is defined in the provider registry, not in this file. An unknown name is rejected by the registry's resolver, not by this file's `check`.
- `NODE_E2E_RUN` is set by the `e2e:serve` script; when true, the SMTP host is restricted to `localhost`, `127.0.0.1`, `::1`, or `mailpit` so a test suite can never mail a real recipient.
- In non-relaxed environments (`isRelaxedIn` is false), `NODE_MAIL_TRANSPORT` must be explicitly set and `outbox` is rejected. In relaxed (dev/test) environments both requirements are skipped.
- All `int` fields enforce `min: 1`; the port fields additionally cap at `65_535`.
