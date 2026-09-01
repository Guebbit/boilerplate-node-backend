# src/types/auth-context.ts

## Purpose

Defines two small type aliases that decouple the HTTP/auth flow from Mongoose document internals. Services, controllers, and middleware consume these plain-shape types instead of `UserDocument`, so the auth contract on the wire is stable and auditable without leaking ORM concerns.

## Key elements

- **`AuthContext`** (interface) — Transport-safe DTO for a resolved caller. Fields: `id`, `email`, `username`, `admin`, and optional `imageUrl`. This is what a request carries after authentication succeeds.
- **`Caller`** (type alias) — `Partial<Pick<AuthContext, 'id' | 'admin'>>`. A deliberately narrower view: only the two fields an authorization rule may read. Both optional because the request may be anonymous. Excludes `email`, `username`, `imageUrl` on purpose so that a rule's type signature makes it impossible (by type) to branch on identity rather than permission.

## Relationships

- **`src/types/index.ts`** — Barrel re-export; downstream imports typically reach these types through the index rather than the file path directly.
- **`src/infrastructure/http/request.ts`** — Attaches an `AuthContext` to the incoming request after auth middleware resolves; controllers read it from here.
- **`src/kernel/authorization.ts`** — Authorization rules accept a `Caller` parameter, constraining what they may inspect to `id` and `admin`.
- **`src/modules/delivery/service.ts`, `src/modules/orders/service.ts`, `src/modules/payments/service.ts`** — Service methods take an optional `authContext?: AuthContext` parameter, representing the (possibly anonymous) caller for the operation.
- **`src/modules/products/tests/integration/service.test.ts`** — Constructs mock `AuthContext` objects to exercise service-level authorization paths.
- **`src/globals.d.ts`** — Likely augments the global `Request` type (e.g., Express) so that `req` carries an `AuthContext` field accessible in controllers without a local import.

## Notes

- `Caller` is **not** `Partial<AuthContext>`. If you need to check `email` or `username` inside an authorization rule, the type system will reject it — that is intentional. Use the full `AuthContext` at the controller/middleware layer instead.
- Both types are pure type-level constructs (interface + type alias); there is no runtime code in this file.
