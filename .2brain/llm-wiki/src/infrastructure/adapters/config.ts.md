---
source: src/infrastructure/adapters/config.ts
sha256: 96e07b5a158299c1d38100690a87eef7c446fccb7975084d4a2aadb3930790c8
generated_at: 2026-10-29T01:53:14.999394+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/config.ts

## Purpose

Centralised, typed configuration slices for every infrastructure adapter (mail, queue, Redis, images, outbound requests, PDF, export store, anti-bot). Each slice is a self-contained `defineConfig` block with field shapes, defaults, and cross-field validation so a bad value names the adapter it belongs to rather than surfacing as a runtime crash.

## Key elements

- **`mailConfig`** / **`MailConfig`** – SMTP transport selection, host/port/user/pass/sender, and the `NODE_E2E_RUN` flag. Validation rejects an SMTP host missing its companion credentials and blocks e2e runs from dialing non-local mail servers.
- **`mailFilesConfig`** – Spool directory and retention hours for mail attachments.
- **`queueConfig`** – RabbitMQ connection (URL, host, port, user, password) plus the shared retry policy (`maxAttempts`, `retryDelaySeconds`).
- **`redisConfig`** – Connection string / host / password, cache key prefix, and the on/off switch for the Redis-backed cache.
- **`imageConfig`** – Max input pixels, max dimension, thumbnail size (defaults pulled from `sharedDefaults`), public path, and quarantine retention/path.
- **`outboundConfig`** – CSV of allowed egress ports; validation rejects non-numeric or out-of-range entries.
- **`pdfConfig`** – Puppeteer/Chromium executable path and the document-store directory.
- **`exportStoreConfig`** – Directory where personal-data export bundles are staged before download or expiry.
- **`ALTCHA_SECRET_MIN_LENGTH`** – Constant (16) used by the antibot check to enforce a minimum HMAC secret length.
- **`antibotConfig`** – Provider selector (`none` / `altcha` / `turnstile`), email policy & allow/deny lists, and per-provider credentials. Validation ensures the chosen provider's required secrets are present and (for ALTCHA) meet the minimum length.

## Relationships

- **`src/app/config.ts`** – Imports the exported config slices and probes/resolves them at application boot before any adapter is constructed.
- **`src/app/jobs.ts`** – Reads `queueConfig` to build RabbitMQ connections and apply the retry policy to job queues.
- **`src/app/static-assets.ts`** – Consumes `imageConfig` to enforce upload size limits and resolve the public/quarantine paths.
- **`src/infrastructure/adapters/antibot-providers/index.ts`** – The provider registry; it imports this file for the field names and refuses unknown `NODE_ANTIBOT_PROVIDER` values at resolution time.
- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** – Reads `antibotConfig` for the ALTCHA secret and cost parameters.
- **`src/infrastructure/adapters/antibot-providers/turnstile.ts`** – Reads `antibotConfig` for the Cloudflare Turnstile site key and secret.
- **`src/infrastructure/adapters/antibot.ts`** – Orchestrates the anti-abuse ladder using the provider and email-policy fields from `antibotConfig`.
- **`src/infrastructure/adapters/cache.ts`** – Uses `redisConfig` to connect and to check the `CACHE_ENABLED` / prefix settings.
- **`src/infrastructure/adapters/document-store.ts`** – Reads `pdfConfig.NODE_DOCUMENT_STORE_PATH` as its storage root.
- **`src/infrastructure/adapters/export-store.ts`** – Reads `exportStoreConfig` for the export bundle directory.
- **`src/infrastructure/adapters/image-store.ts`** / **`src/infrastructure/adapters/image.ts`** – Consume `imageConfig` for limits, public path, and quarantine settings.
- **`src/infrastructure/adapters/mail-spool.ts`** – Uses `mailFilesConfig` for the spool path and retention window.
- **`src/infrastructure/adapters/mail-transports.ts`** – Instantiates the chosen transport from `mailConfig` (host, port, credentials, sender).
- **`src/infrastructure/adapters/mailer.ts`** – Composes `mailConfig` + `mailFilesConfig` + `mail-transports` into the public mail interface.

## Notes

- **Selector fields are opaque strings here.** `NODE_ANTIBOT_PROVIDER` is just `text()`; the set of valid names is owned by the provider registry (`antibot-providers/index.ts`), which imports this file. The registry's resolver rejects unknown names, and `app/config.ts` probes it at boot. Do not add a `choice()` enum to this file for provider selection.
- **`check` callbacks return an array of field names** (or pre-formatted messages for `outboundConfig`), not thrown errors. The caller (`app/config.ts`) aggregates and reports them.
- **`sharedDefaults`** (from `@infrastructure/config/defaults.generated`) provides the image-related defaults so the frontend and backend stay in sync without a manual copy.
- Fields marked `sensitive: true` are expected to be redacted in logs and error output by the config framework; do not log those keys.
