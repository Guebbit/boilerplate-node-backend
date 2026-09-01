# src/app/request-context.ts

## Purpose

Installs the per-request context middleware (correlation ID, access logging, observability, locale) in a single, ordered block that must run before any route is registered. It exists to keep all "attach-then-read" setup in one place so the ordering contract is explicit and maintained alongside the routes it guards.

## Key elements

- **`installRequestContext(app: Express): void`** — the sole export. Registers three middleware in a fixed sequence:
  1. **Request-ID middleware** (inline): reads `x-request-id` from the incoming request; falls back to `crypto.randomUUID()`. Stamps `request.requestId` and echoes the value in the `x-request-id` response header.
  2. **`requestLogger`** (from `request-logger.ts`): Winston access-log line + OpenTelemetry trace injection. Relies on `request.requestId` already being set.
  3. **`attachLocale`** (from `locale.ts`): negotiates `Accept-Language` and stores the resolved locale on the request for downstream i18n lookups.

## Relationships

- **`src/app.ts`** — the caller. Invokes `installRequestContext(app)` before wiring routers, which is why this module "must precede the routes."
- **`src/infrastructure/http/middlewares/request-logger.ts`** — supplies `requestLogger`; expects `request.requestId` to already exist (set by the inline middleware above it).
- **`src/infrastructure/http/middlewares/locale.ts`** — supplies `attachLocale`; runs last so that any locale-dependent logging inside `requestLogger` sees the negotiated locale.
- **`package.json`** — declares the `express` and `node:crypto` dependencies this file imports.

## Notes

- **Order is load-bearing.** The module doc-comment and the inline comment both call out that reordering (e.g., moving `attachLocale` before the logger, or generating the ID after the logger) will silently break audit-log correlation or locale-aware log lines.
- **`request.requestId` is a dynamic property**, not part of the Express `Request` type. Downstream code accessing it should expect an untyped property (or a local type augmentation); there is no `declare global` in this file.
- **Client-supplied IDs are trusted as-is.** If a caller sends an arbitrary `x-request-id` header, it is used verbatim without sanitisation.
