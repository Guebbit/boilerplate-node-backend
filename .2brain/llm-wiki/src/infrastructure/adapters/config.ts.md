---
source: src/infrastructure/adapters/config.ts
sha256: 6bfee5b4f3944e02ac1b2f020fe389350aca1cacca1ebabec917ec4b08ed063c
generated_at: 2026-11-08T03:18:10.927129+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/config.ts

## Purpose

Declares typed, validated configuration slices for every infrastructure adapter (mail, queue, Redis, images, outbound, PDF, exports, anti-abuse). Each slice is a `defineConfig` block that maps environment variables to typed fields with defaults, ranges, and cross-field checks, so a misconfigured value names the adapter that owns it at parse time rather than failing at first use.

## Key elements

- **`mailConfig`** — Mail transport selector + full SMTP account. `check` enforces that SMTP companions (user, pass, sender) are all set when a host is given, and restricts e2e runs to local sinks.
- **`supportEmail()`** — Accessor that returns `NODE_SUPPORT_EMAIL` or throws `ConfigError`. The single source of truth for the customer-facing address.
- **`MailConfig`** — Type alias for the parsed mail slice.
- **`mailFilesConfig`** — Spool directory and retention hours for attachments.
- **`queueConfig`** — RabbitMQ connection (URL, host, port, credentials) plus `NODE_QUEUE_MAX_ATTEMPTS` and retry delay shared by all queues.
- **`redisConfig`** — Redis connection and cache prefix/enabled flags shared by cache and rate-limiter.
- **`imageConfig`** — Pixel/dimension limits, thumbnail size, public path, quarantine path and retention. Defaults pulled from `sharedDefaults` (generated file).
- **`outboundConfig`** — CSV of allowed ports for caller-supplied outbound requests; `check` validates each entry is a 1–65535 integer.
- **`pdfConfig`** — Puppeteer executable path and document-store directory.
- **`exportStoreConfig`** — Private store path for built personal-data exports.
- **`ALTCHA_SECRET_MIN_LENGTH`** — Exported constant (16); minimum HMAC secret length for ALTCHA.
- **`antibotConfig`** — Provider selector (`none`/`altcha`/`turnstile`), email policy + allow/deny lists, and per-provider credentials. `check` requires the matching secret/key when a specific provider is selected.

## Relationships

- **`src/app/config.ts`** — Probes this file's selectors at boot to surface unknown provider names before the server accepts traffic.
- **`src/infrastructure/adapters/antibot-providers/index.ts`** — The provider registry imports `antibotConfig` to resolve `NODE_ANTIBOT_PROVIDER`; its resolver rejects names it does not recognise.
- **`src/infrastructure/adapters/mail-transports.ts`** — Reads `mailConfig` to construct the chosen transport.
- **`src/infrastructure/adapters/mail-spool.ts`** — Reads `mailFilesConfig` for spool path and retention.
- **`src/infrastructure/adapters/cache.ts`** — Reads `redisConfig` for connection and cache switches.
- **`src/infrastructure/adapters/image.ts` / `image-store.ts`** — Read `imageConfig` for processing limits and storage paths.
- **`src/infrastructure/adapters/document-store.ts`** — Reads `pdfConfig` for the document store path.
- **`src/infrastructure/adapters/export-store.ts`** — Reads `exportStoreConfig` for the export directory.
- **`src/infrastructure/adapters/antibot.ts`** — Reads `antibotConfig` to drive the anti-abuse ladder.
- **`src/infrastructure/adapters/antibot-providers/altcha.ts` / `turnstile.ts`** — Read their respective credential fields from `antibotConfig` and the `ALTCHA_SECRET_MIN_LENGTH` constant.
- **`src/app/jobs.ts`** — Reads `queueConfig` for RabbitMQ connection and retry policy.

## Notes

- `NODE_ANTIBOT_PROVIDER` is intentionally a plain `text` field here, not a `choice`. Valid provider names live in the registry (which imports this file), avoiding a circular dependency. The registry's resolver enforces the closed set.
- `imageConfig` defaults come from `@infrastructure/config/defaults.generated` (`sharedDefaults`), a build-time generated module — not a hand-edited file.
- `check` callbacks return arrays of human-readable error strings (or bare field names for `antibotConfig`). A non-empty array means the slice failed validation.
- Fields marked `sensitive: true` are redacted in any config dump or error output.
- `NODE_E2E_RUN` + `NODE_MAIL_TRANSPORT=smtp` restricts the SMTP host to `localhost`, `127.0.0.1`, `::1`, or `mailpit` to prevent accidental real mail delivery during test runs.
- The `path` import is `node:path`; all directory defaults are relative (e.g. `tmp/storage/mail-spool`), not absolute.
