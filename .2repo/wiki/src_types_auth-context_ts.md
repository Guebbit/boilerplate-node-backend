# src/types/auth-context.ts

## Purpose

Defines the two auth-related type contracts that sit between the HTTP/auth layer and domain logic: `AuthContext` (the full resolved caller DTO attached to a request) and `Caller` (the minimal, permission-relevant subset an authorization rule may read). Its job is to let controllers, middleware, and service signatures depend on a plain interface instead of `UserDocument`, keeping the Mongoose schema internal.

## Key elements

- **`AuthContext` (interface)** — Transport-safe DTO describing a resolved caller. Fields: `id`, `email`, `username`, `admin`, `imageUrl?`, `authTime` (epoch seconds of last re-auth), `amr` (RFC 8176 proof-method array), `analyticsConsent?` (`'granted' | 'denied'`). Only `authTime`/`amr` are consumed by `requireFreshAuth`; only `analyticsConsent` is read by `emitAnalyticsEvent`'s gate.
- **`Caller` (type alias)** — `Partial<Pick<AuthContext, 'id' | 'admin'>>`. A deliberately narrower view for authorization rules: both fields optional (request may be anonymous), and identity fields (`email`, `username`, `imageUrl`) are excluded so a rule cannot silently depend on them.

## Relationships

- **`src/types/index.ts`** — Barrel that re-exports `AuthContext` and `Caller`, making them available project-wide as `@/types`.
- **`src/kernel/authorization.ts`** — Authorization rule signatures accept `Caller` (not the full `AuthContext`), enforcing the "rules only ask about `id`/`admin`" boundary.
- **`src/infrastructure/http/request.ts`** — Attaches / reads `AuthContext` on the HTTP request object; controllers pull the context from here rather than from the DB.
- **`src/modules/delivery/service.ts`, `src/modules/orders/service.ts`, `src/modules/payments/service.ts`** — Service methods accept an optional `AuthContext` parameter (the request may be anonymous), relying on this type instead of repeating `{ id?: string; admin?: boolean }` inline.
- **`src/modules/products/tests/integration/service.test.ts`** — Constructs mock `AuthContext` objects to exercise the products service in integration tests.
- **`src/globals.d.ts`** — Global type declarations; this module's types may be referenced in ambient typings (e.g., extending a request interface) so controllers can access `req.authContext` without a local import.

## Notes

- `Caller` is intentionally *not* `Partial<AuthContext>`. If you find a need to read `email` or `username` inside an authorization rule, that signals a design smell the type system is meant to prevent.
- `analyticsConsent` is `undefined` when the user has never been asked. Downstream code (`emitAnalyticsEvent`) treats `undefined` as "gate closed," not as consent.
- `amr` is typed `readonly string[]`; the only value in use today is `'pwd'`. Do not widen the union in `AuthContext` without updating `requireFreshAuth`.
