# docs/reference/src-infrastructure.md

## Purpose

Documents `src/infrastructure/`, the bottom tier of the application — everything the app runs *on* (runtime, adapters, HTTP plumbing, persistence, observability, i18n, surfaces) and nothing about any domain. It exists so a reader can locate the "outside the app" layer without reading source, and to make the hard boundary (enforced by `eslint.config.ts`) explicit.

## Key elements

- **`runtime/`** — Boot & shutdown: `otel-sdk.ts` (OpenTelemetry SDK, must be imported first in `app.ts`), `environment.ts` (hard env validation at boot), `database.ts` (Mongo URI resolution, connect-retry, `stopDatabase`), `server-lifecycle.ts` (signal handlers, drain, reverse-order teardown).
- **`adapters/`** — External-world ports, all **fail-open**: `managed-connection.ts` (shared optional-connection lifecycle for Redis & RabbitMQ), `cache.ts` (Redis byte store), `queue.ts` (AMQP 0-9-1, no-ops without a broker), `logger.ts` (Winston instance), `mailer.ts` + `email.worker.ts` (EJS + SMTP / queued email), `pdf.ts` + `pdf.worker.ts` (Puppeteer HTML→PDF), `storage.ts` (multer write side), `image-store.ts` (single port for image URL↔path), `image-signatures.ts` (byte-based image identification), `filesystem.ts` (`moveFile` for cross-device uploads), `demo-outbox.ts` (demo-profile email sink).
- **`http/`** — Request/response plumbing: `request.ts` (transport-agnostic input reading), `schemas.ts` (scalar decoding, no validation), `response.ts` (uniform success/error envelope), `errors.ts` (HTTP error types + `databaseErrorInterpreter`), `uploads.ts` (read side of multipart), `middlewares/rate-limit.ts`, `middlewares/locale.ts` (language negotiation wrapping the chain), `middlewares/cache.ts` (HTTP response cache key + TTL + size limits).
- **`persistence/`** — Document ↔ payload mapping (content truncated in source).
- **`observability/`** — Logs, metrics, traces wiring (content truncated).
- **`i18n/`** — One language per request (content truncated).
- **`surfaces/`** — Repeated route shape (content truncated).

## Relationships

- **`docs/theory/layers.md`** — Defines the layer model in which infrastructure is the bottom tier; the eslint boundary that keeps it domain-free is described there.
- **`docs/theory/clustering.md`** — `server-lifecycle.ts` implements the graceful shutdown / drain sequencing described in the clustering theory.
- **`docs/theory/request-flow.md`** — `errors.ts` (`databaseErrorInterpreter`) is the single decision point for driver-failure → 4xx vs 5xx mapping.
- **`docs/theory/request-input.md`** — `http/request.ts` is the concrete implementation of the transport-agnostic input-reading pattern.
- **`docs/tools/mongodb-mongoose.md`** — `runtime/database.ts` owns the Mongo connection lifecycle referenced throughout that doc.
- **`docs/tools/observability-layer.md`** / **`docs/api/observability.md`** — `runtime/otel-sdk.ts` and the `observability/` subdirectory are the concrete substrate those docs describe.
- **`docs/tools/email-and-rendering.md`** — `mailer.ts`, `email.worker.ts`, `pdf.ts`, `pdf.worker.ts` are the adapters behind that tooling doc.
- **`docs/tools/i18n.md`** — `middlewares/locale.ts` and the `i18n/` subdirectory implement the per-request language negotiation.
- **`docs/tools/contract-request-data.md`** — `http/schemas.ts` decodes the contract scalars that doc specifies.
- **`docs/tools/demo-profile.md`** — `demo-outbox.ts` is the email sink that makes e2e tests readable under `npm run demo`.
- **`docs/api/endpoints.md`** — `http/response.ts` defines the uniform envelope every endpoint returns; `middlewares/rate-limit.ts` guards the metrics endpoint.
- **`docs/reference/data.md`** — The `persistence/` subdirectory is the infrastructure half of the data-reference page.
- **`docs/reference/index.md`** — This page is one of the entries linked from the reference index.

## Notes

- **Import order is critical**: `otel-sdk.ts` must load before express, mongoose, or redis in `app.ts`; a later import silently produces zero spans (auto-instrumentation patches at load time).
- **Adapters never throw for an absent dependency**: Redis down → cache miss, RabbitMQ down → no-op publish, SMTP down → feature off. The caller decides what a miss means.
- **`filesystem.moveFile` uses `rename`**, which cannot cross a device boundary — uploads stage on a different filesystem from the public directory, so a plain `fs.rename` would throw `EXDEV`.
- **`image-signatures.ts` checks bytes, not the client-declared `Content-Type`**, as a defence against an HTML file disguised as an image.
- **`database.ts` URI logic is mirrored in `migrate-mongo-config.js`**; a test pins the two together, so changing one without the other fails CI.
- The entire directory is **eslint-fenced** from importing any `src/modules/*` path; treating it as importable from infrastructure is an architectural violation.
