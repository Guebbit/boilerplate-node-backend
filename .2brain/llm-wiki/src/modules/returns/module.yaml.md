---
source: src/modules/returns/module.yaml
sha256: 45b2204c58d50cb311500bc5cb5b1623221787963f3a94e3c0c3454327a00682
generated_at: 2026-11-08T08:00:23.109824+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/module.yaml

## Purpose

Module descriptor for the **returns** sub-module (EU returns + pre-dispatch withdrawal). It declares the module's domain summary, group membership, upstream dependencies, a write-path rate limit, and a periodic cleanup job — all operational metadata that sits alongside the API definition rather than in it.

## Key elements

- **summary / subdomain / group** — Classifies the module: "Sending goods back, including the EU withdrawal button," under `supporting` subdomain in the `shop` group.
- **dependsOn** — Lists six upstream modules the return flow touches:
  - `access` — `ownOrderFlag` audit flag for the caller's own order.
  - `delivery` — return address; cheapest standard delivery rate used as the withdrawal refund cap.
  - `inventory` — re-listing received goods for sale.
  - `orders` — order lines, owner identity, and the cancel path a pre-dispatch withdrawal becomes.
  - `payments` — refund for received goods; `PAYMENT_REFUNDED` event that closes a return.
  - `shop` — destination for returned goods; determines who bears postage.
- **rateLimits.returnsWrite** — Rate limit on `POST /returns`, keyed on **ACCOUNT** (not address). Namespace `returns-write`, env-overridable via `NODE_RETURNS_RATE_LIMIT_MAX`, default 20 requests per shared window. Audited. The account keying prevents one signed-in account behind a shared address from starving other callers.
- **jobs.reapReturns** — Cron `12 2 * * *` (02:12 daily). Clears a return's free-text fields (`note`, `declineMessage`) once the return has been unchanged for its retention window.

## Relationships

- **src/modules/returns/openapi.yaml** — Sibling file in the same module directory. `module.yaml` holds the non-API operational concerns (dependencies, rate limits, scheduled jobs) while `openapi.yaml` defines the HTTP surface (`POST /returns`, etc.) that the rate limit and dependency list above constrain and support.

## Notes

- `windowMs: shared` is a sentinel value, not a millisecond count — it means "use the window configured globally for this namespace" rather than a per-module window.
- The `audited: true` flag on the rate limit means every throttled request is logged for review, not silently dropped.
- The dependency list is intentionally minimal; it records *what* the return flow reads from or writes to in each neighbor, not the full schema surface. Treat it as a pointer, not an API contract.
