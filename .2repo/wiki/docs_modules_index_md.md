# docs/modules/index.md

## Purpose

Index page for the **modules** (vertical/domain) section of the wiki. It defines the division of labour between module pages (own a *decision*) and horizontal pages (own a *mechanism*), lists every domain module grouped by DDD subdomain, and documents the backend ↔ frontend module pairing — including the deliberate asymmetries.

## Key elements

- **Vertical/horizontal rule** — one-sentence test: delete `src/modules/<name>/` and exactly one page in this site must die; every other page loses only a link.
- **Module roster by subdomain** — three groups:
  - *core*: `cart` (+ `cart-checkout`), `orders`, `products`
  - *supporting*: `delivery`, `inventory` (+ `inventory-reservations`), `payments` (+ `payments-provider-port`), `wishlist`
  - *generic*: `account` (+ `account-sessions`), `audit-logs` (headless), `feedback`, `locales`, `observability`, `users`
- **Two-repository mapping table** — maps each backend module to its frontend counterpart(s) in `boilerplate-vue-frontend`.
- **Cross-cutting test reference** — `tests/cross-cutting/frontend-pairing.test.ts` enforces that the table stays in sync with both codebases; non-trivial pairings must carry a written reason.

## Relationships

- **Outbound links** (the pages this index points to): `cart.md`, `delivery.md`, `feedback.md`, `inventory.md`, `locales.md`, `observability.md`, `orders.md`, `payments.md`, `products.md`, `users.md`, `wishlist.md`, plus `cart-checkout.md`, `inventory-reservations.md`, `payments-provider-port.md`, `account.md`, `account-sessions.md`, `audit-logs.md`.
- **Sister sections referenced for context**: `../theory/`, `../tools/`, `../api/`, `../reference/` — each owns the horizontal slice that module pages deliberately leave out.
- **Enforcement**: the pairing test in `tests/cross-cutting/` treats this page's table as a contract; a new module added to either repo without a matching entry (or a missing entry for a deleted module) will fail CI.

## Notes

- The `audit-logs` / `observability` rows are the **only** non-1:1 mappings. `audit-logs` has no URL of its own; its read endpoint lives under `observability` and its UI lives under the frontend's `admin` module. `observability` splits across `admin` (health/metrics) and `realtime` (SSE) on the frontend.
- The frontend's `demo` module has **no** backend counterpart by design; it pairs with the demo profile and seeded dataset rather than any single domain.
- The page explicitly defers *what a mechanism is* to `../tools/` and *what a module's rules are* to `../theory/strategic-ddd.md`. Do not duplicate that content here; the wiki invariant is one-page-per-concern.
