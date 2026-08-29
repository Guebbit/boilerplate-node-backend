# docs/api/endpoints.md

## Purpose

Design-rationale companion to the API route table. `openapi.yaml` says *what* each route accepts and returns; `src/modules/<name>/routes.ts` says *how* the middleware chain enforces it; this page says *why* the surface is shaped the way it is, domain by domain. It exists to prevent future changes from contradicting decisions that are otherwise invisible in code or contract.

## Key elements

- **Domain sections** — one per bounded context (System, Observability, Account & Auth, Products, Cart, Wishlist, Orders, Payments, Delivery, Inventory, Users, Locales, Feedback, Realtime). Each states the auth model, data-ownership rules, and non-obvious invariants for that slice of the API.
- **Inventory transition table** — the six conditional writes (`reserve`, `commit`, `release`, `expire`, `receive`, `adjust`) that are the *only* mutators of `onHand` / `reserved`, each paired with its ledger row.
- **All-or-nothing checkout refusal contract** — a single response with `errors[0].details.lines` reporting every short line at once, on both the pre-flight and the race-time refusal path.
- **Realtime / SSE note** — documents that push is SSE-only (`GET /observability/events`), there is no WebSocket, and what would be required to add bidirectional messaging.
- **`routeFlag('hardDelete')` convention** — destructive user routes get a dedicated `/hard` URL so a client must opt in explicitly rather than via a query string.

## Relationships

- **`docs/api/openapi-workflow.md`** — referenced in the tip callout and Related pages as the authoritative, exhaustive route list from which this page derives its "why."
- **`docs/api/observability.md`** — cross-linked from the Observability section (response shapes, tool links) and the Realtime section (event names, payload shapes from `asyncapi.yaml`).
- **`docs/api/index.md`** — linked in Related pages as the API overview / REST-pattern summary that this page elaborates.
- **`docs/modules/account.md`** — linked in the Account & Auth section as the domain module whose `routes.ts` and middleware back the JWT / refresh-token / password-reset endpoints described here.

## Notes

- **No scheduler in-repo.** Token-expiry sweeps, reservation-TTL expiry, and the fake courier's `POST /delivery/advance` are all driven externally (cron, platform job, operator). The docs flag this so a reader doesn't look for a `setInterval` that isn't there.
- **Low-stock threshold is intentionally inconsistent.** `NODE_LOW_STOCK_THRESHOLD` feeds both the admin board's `lowOnly` filter (whole catalogue, including inactive) and the `products_low_stock_total` gauge (publicly visible products only). Both measure *availability*, not `onHand`.
- **`verified` flag on `User` is informational only.** No endpoint refuses an unverified account; the flag exists for display, not gating.
- **Payments default provider is `fake`.** Exactly one card number (`4000000000000002`) is hard-coded to decline; everything else succeeds. No external calls.
- **Locales are public by design.** The message-dictionary endpoint is reachable without a token because the one user who most needs it is the one who just got a 401.
