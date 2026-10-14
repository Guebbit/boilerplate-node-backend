---
source: src/infrastructure/adapters/config.ts
sha256: c662c8e08c4b0fd91b7897590b8fdd62cd09db8d2e6a3d35ceee7667b47f0ff7
generated_at: 2026-10-14T07:42:31.023390+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/config.ts

## Purpose

Centralises every environment-variable slice that the infrastructure adapters read. Each slice is a `defineConfig` block with a typed shape, sensible defaults, and a `check` function that surfaces missing or contradictory values at boot time. The file exists so that a misconfigured value can be attributed to a single adapter (mail, Redis, images, anti-abuse, etc.) rather than to a flat bag of `NODE_*` variables.

## Key elements

- **`mailConfig`** – Transport selection (`smtp`/`log`) plus the SMTP account (host, port, user, pass, sender). `check` flags an SMTP host that lacks its companion credentials and blocks e2e runs aimed at a non-local host.
- **`MailConfig`** (type) – `ReturnType<typeof mailConfig>`; the parsed shape a transport consumes.
- **`mailFilesConfig`** – Spool directory and retention hours for queued mail attachments.
- **`queueConfig`** – RabbitMQ connection (URL, host, port, credentials, enabled flag) and the shared retry policy (max attempts, delay).
- **`redisConfig`** – Redis connection, cache prefix, and the cache enable switch. Shared by the cache adapter and the rate limiter.
- **`imageConfig`** – Upload pixel/dimension caps, thumbnail size, public asset path, and quarantine path + retention.
- **`outboundConfig`** – `NODE_OUTBOUND_ALLOWED_PORTS` CSV; `check` rejects non-numeric or out-of-range entries.
- **`pdfConfig`** – Puppeteer/Chromium executable path and the document-store directory.
- **`exportStoreConfig`** – Directory where built personal-data exports wait for download.
- **`ALTCHA_SECRET_MIN_LENGTH`** (constant, `16`) – Enforced minimum secret length for ALTCHA challenges.
- **`antibotConfig`** – Provider selector (`none`/`altcha`/`turnstile`), email policy (allow/deny lists, disposable/MX check), and per-provider credentials. `check` ensures the selected provider has the secrets it needs.
- **`E2E_LOCAL_SMTP_HOSTS`**, **`SMTP_COMPANIONS`** – Module-private constants used only by `mailConfig.check`.

## Relationships

- **`src/app/config.ts`** – Probes every slice exported here at application boot; unknown anti-bot provider names are rejected via the provider registry's resolver.
- **`src/infrastructure/adapters/antibot.ts`** – Reads `antibotConfig` to dispatch to the chosen provider.
- **`src/infrastructure/adapters/antibot-providers/index.ts`** – The provider registry whose valid names constrain `NODE_ANTIBOT_PROVIDER`; imports this file for the resolver.
- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** – Consumes `NODE_ANTIBOT_ALTCHA_SECRET` / `NODE_ANTIBOT_ALTCHA_COST`.
- **`src/infrastructure/adapters/antibot-providers/turnstile.ts`** – Consumes `NODE_ANTIBOT_TURNSTILE_SITE_KEY` / `NODE_ANTIBOT_TURNSTILE_SECRET`.
- **`src/infrastructure/adapters/mail-transports.ts`** – Reads `mailConfig` (transport, SMTP account) to build the active transport.
- **`src/infrastructure/adapters/mail-spool.ts`** – Reads `mailFilesConfig` for spool path and retention.
- **`src/infrastructure/adapters/cache.ts`** – Reads `redisConfig` for connection and cache switches.
- **`src/infrastructure/adapters/image.ts`** / **`image-store.ts`** – Read `imageConfig` for dimension caps and storage paths.
- **`src/infrastructure/adapters/document-store.ts`** – Reads `pdfConfig` for the Chromium path and storage directory.
- **`src/infrastructure/adapters/export-store.ts`** – Reads `exportStoreConfig` for the export directory.
- **`src/app/static-assets.ts`** – Reads `imageConfig` for `NODE_PUBLIC_PATH`.
- **`scripts/ops/reap-mail-spool.ts`** – Reads `mailFilesConfig` to locate and prune the spool.
- **`scripts/ops/reap-quarantine.ts`** – Reads `imageConfig` for the quarantine path and retention window.

## Notes

- `NODE_ANTIBOT_PROVIDER` is stored as plain text here; the *set* of valid values lives in the anti-bot provider registry (`antibot-providers/index.ts`), which imports this file. The registry's resolver rejects unknown names, and `app/config.ts` probes it at boot.
- The `check` functions return arrays of human-readable error strings (or field-name strings for the antibot case). They run at boot, not per-request, so a bad value causes a startup failure rather than a silent runtime error.
- `sensitive: true` on a field marks it for redaction in logs/diagnostics; the value is still stored in the config object itself.
- `csv()` fields are split on commas and trimmed; `outboundConfig.check` then validates each entry is a 1–65 535 integer.
- E2E guard: when `NODE_E2E_RUN` is true and transport is `smtp`, the host must be one of `localhost`, `127.0.0.1`, `::1`, or `mailpit`; otherwise boot fails with an explicit hint to use `NODE_MAIL_TRANSPORT=log`.
