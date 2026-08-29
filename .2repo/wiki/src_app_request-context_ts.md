# src/app/request-context.ts

## Purpose

Installs the set of per-request context middlewares (request ID, access logging, observability, locale) on the Express app. All of these attach data that downstream route handlers read, so this function must be called before any routes are mounted. The internal ordering of the three middlewares is load-bearing: the request ID must exist before the logger and any audit entry records it.

## Key elements

- **`installRequestContext(app: Express): void`** — sole export. Registers three middlewares in strict order:
  1. Inline request-ID middleware — reuses the inbound `x-request-id` header or generates a `crypto.randomUUID()`, stamps it onto `request.requestId` and the response header.
  2. `requestLogger` (imported from `@infrastructure/http/middlewares/request-logger`) — Winston access log plus OpenTelemetry trace injection.
  3. `attachLocale` (imported from `@infrastructure/http/middlewares/locale`) — resolves `Accept-Language` and binds the negotiated locale to the request so all downstream copy resolution uses it.

## Relationships

- **`src/app.ts`** — the calling site; invokes `installRequestContext(app)` before any route mounting.
- **`src/infrastructure/http/middlewares/request-logger.ts`** — provides the `requestLogger` middleware consumed as the second step.
- **`src/infrastructure/http/middlewares/locale.ts`** — provides the `attachLocale` middleware consumed as the third step.
- **`package.json`** — declares the `express` type dependency used by this file.

## Notes

- The comment block explicitly flags the ordering as load-bearing. Reordering the middlewares (e.g., putting `requestLogger` before the ID middleware) would break log correlation.
- The request ID is set as a *mutable property* on the Express request object (`request.requestId`), not via `req.headers`. Downstream code that reads it should use the property, not the header.
- The client-supplied `x-request-id` is trusted as-is (no validation or sanitisation visible here).
