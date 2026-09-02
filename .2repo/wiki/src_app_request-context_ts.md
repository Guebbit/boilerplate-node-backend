# src/app/request-context.ts

## Purpose

Installs the per-request context middleware (request-id, access log, locale) on an Express application. It exists as a single grouped install step because every downstream route depends on the values these middlewares attach to `req`, and the internal ordering is load-bearing: the request id must be generated before the access logger records it.

## Key elements

- **`REQUEST_ID_PATTERN`** — Strict canonical-UUID regex (any RFC 4122 version/variant). The only client-supplied `x-request-id` shape accepted; anything else is discarded in favor of a server-generated ID. Prevents log-injection via the correlation id.
- **`installRequestContext(app: Express): void`** — The sole export. Registers three middlewares in order:
  1. Inline request-id middleware — validates `x-request-id` against `REQUEST_ID_PATTERN`; reuses it if valid, otherwise generates via `crypto.randomUUID()`. Sets `request.requestId` and echoes the id back in the `x-request-id` response header.
  2. `requestLogger` (Winston access log + OpenTelemetry trace injection).
  3. `attachLocale` (negotiates `Accept-Language` and runs the request inside that locale).

## Relationships

- **`src/app.ts`** — Calls `installRequestContext` during app setup, before any route is mounted, so that all downstream handlers can read `requestId`, the log context, and the locale.
- **`src/infrastructure/http/middlewares/request-logger.ts`** — Provides the `requestLogger` middleware (Winston structured logging + OTel span injection) that is registered second in the chain.
- **`src/infrastructure/http/middlewares/locale.ts`** — Provides the `attachLocale` middleware (Accept-Language negotiation) registered last.
- **`package.json`** — Supplies the `express` type dependency used in the function signature.

## Notes

- **Order is load-bearing.** `requestLogger` reads `request.requestId` that the first middleware set; swapping the two middlewares breaks log correlation. Similarly, `attachLocale` must precede routes because user-facing strings resolve against it.
- **Client-supplied IDs are never trusted blindly.** A non-UUID `x-request-id` (arbitrary length, newlines, control chars) is silently replaced by a server-generated UUID — the client's value never reaches Winston or audit entries.
- The response header `x-request-id` always reflects the *accepted* id (client's if valid, generated otherwise), so callers can correlate even when they didn't supply a valid one.
