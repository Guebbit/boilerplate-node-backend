---
source: src/infrastructure/adapters/config.ts
generated_at: 2026-11-22T02:35:37.792041+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/config.ts

## Purpose
Declares the configuration slices for the infrastructure adapters: mail, RabbitMQ, Redis, images, outbound requests, PDF rendering, the export store and the anti-abuse ladder. Each adapter gets its own slice, so an invalid value names the adapter it belongs to. Cross-field validation (`check`) catches misconfiguration at boot rather than at first use.

## Key elements
- `mailConfig`: slice `mail`. It covers the transport (`NODE_MAIL_TRANSPORT`, default `smtp`), the SMTP account, `NODE_SUPPORT_EMAIL` and the `NODE_E2E_RUN` flag. Its `check` does two things:
  - It requires `NODE_SMTP_USER`, `NODE_SMTP_PASS` and `NODE_SMTP_SENDER` whenever `NODE_SMTP_HOST` is set.
  - During an e2e run on the `smtp` transport, it only accepts `localhost`, `127.0.0.1`, `::1` or `mailpit` as the host.
- `supportEmail()`: returns `NODE_SUPPORT_EMAIL`, or throws `ConfigError` if it is unset.
- `MailConfig`: type of the parsed mail slice.
- `mailFilesConfig`: slice `mail-files`. Spool path and retention hours for attachments.
- `queueConfig`: slice `queue`. RabbitMQ URL/host/port/credentials, an enabled flag, and the shared retry policy (`NODE_QUEUE_MAX_ATTEMPTS`, `NODE_QUEUE_RETRY_DELAY_SECONDS`).
- `redisConfig`: slice `redis`. Connection settings, cache prefix and a cache-enabled flag. The connection is shared by the cache and the rate limiter.
- `imageConfig`: slice `images`. Pixel and dimension limits, thumbnail size, public path, and quarantine path and retention. Several defaults come from `sharedDefaults.images`.
- `outboundConfig`: slice `outbound`. `NODE_OUTBOUND_ALLOWED_PORTS` is a CSV list. `check` reports any entry that is not an integer from 1 to 65535.
- `pdfConfig`: slice `pdf`. The Chromium executable path (`PUPPETEER_EXECUTABLE_PATH`) and the document store path.
- `exportStoreConfig`: slice `exportStore`. Path of the private store for personal-data exports.
- `ALTCHA_SECRET_MIN_LENGTH`: constant `16`.
- `antibotConfig`: slice `antibot`. Provider selector, email policy (`off`, `disposable` or `mx`), allow/deny lists, and ALTCHA and Turnstile credentials. Its `check` flags the keys that the selected provider is missing.

## Relationships
- Built on `defineConfig`/`ConfigError` and the field helpers from `@infrastructure/config`, and on `sharedDefaults` for image defaults.
- The sibling adapters read their own slices. The slice-to-adapter mapping below is inferred from the slice contents:
  - `cache.ts` and the rate limiter use Redis.
  - `antibot.ts`, `antibot-providers/altcha.ts` and `antibot-providers/turnstile.ts` use the antibot slice.
  - `mail-spool.ts` uses `mailFilesConfig`.
  - `image.ts` and `image-store.ts` use `imageConfig`.
  - `document-store.ts` uses `pdfConfig`.
  - `export-store.ts` uses `exportStoreConfig`.
  - `job-drain.ts` relates to the queue slice.
- The provider registry (`src/infrastructure/adapters/antibot-providers/index.ts`) imports this file. For that reason `NODE_ANTIBOT_PROVIDER` is plain text here, and the registry's resolver rejects unknown names.
- `src/app/config.ts` probes the provider name at boot. `config-routes.ts`, `jobs.ts` and `static-assets.ts` in `src/app` are also graph neighbors. The file content does not show how they use it.

## Notes
- `NODE_ENV=test` skips the boot check, which is why `supportEmail()` throws explicitly when the address is missing.
- `NODE_SUPPORT_EMAIL` is declared here because the mailer reads it and infrastructure may not import a module.
- Secrets such as the SMTP password, RabbitMQ URL and password, Redis URL and password, and the ALTCHA and Turnstile secrets are marked `sensitive`.
- The antibot `check` requires an ALTCHA secret of at least 16 characters. For Turnstile it requires both the site key and the secret.
- Default storage paths all live under `tmp/` (`tmp/storage/mail-spool`, `tmp/storage/documents`, `tmp/storage/exports`, `tmp/quarantine`).
