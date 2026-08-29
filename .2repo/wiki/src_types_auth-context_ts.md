# src/types/auth-context.ts

## Purpose

Defines the transport-safe authentication context DTO (`AuthContext`) and the narrower authorization-decision type (`Caller`). It exists so that controllers, middleware, and services depend on a plain interface rather than a Mongoose `UserDocument`, keeping the HTTP/auth layer decoupled from persistence internals.

## Key elements

- **`AuthContext` (interface)** — The resolved caller identity: `id`, `email`, `username`, `admin`, and optional `imageUrl`. This is what a *request carries* after the auth middleware has resolved it.
- **`Caller` (type)** — `Partial<Pick<AuthContext, 'id' | 'admin'>>`. The minimal shape an *authorization rule* may inspect. Intentionally narrower than `Partial<AuthContext>`: it excludes identity fields (`email`, `username`, `imageUrl`) so that rules cannot read them by type.

## Relationships

- **`src/types/index.ts`** — Re-exports `AuthContext` and `Caller` as part of the project-wide type surface.
- **`src/infrastructure/http/request.ts`** — Attaches an `AuthContext` to the request object after authentication.
- **`src/kernel/authorization.ts`** — Consume point for `Caller`; authorization rules receive and check this narrower type.
- **`src/modules/delivery/service.ts`, `src/modules/orders/service.ts`, `src/modules/payments/service.ts`** — Service methods accept `authContext?: AuthContext` (or `Caller`) to identify the acting user without touching the Mongoose model.
- **`src/modules/products/tests/integration/service.test.ts`** — Constructs `AuthContext` / `Caller` fixtures for integration tests.
- **`src/globals.d.ts`** — Likely references these types in global augmentation (e.g., extending `Request`).

## Notes

- Use `Caller`, not `Partial<AuthContext>`, when writing authorization predicates. The distinction is deliberate: `Caller` signals "I only need a permission bit," while `Partial<AuthContext>` would silently permit reading identity fields, which is not auditable by type alone.
- Services that accept an *optional* caller (anonymous requests possible) should type the parameter as `Caller | undefined`, not `AuthContext | undefined`, unless they genuinely need the full identity.
