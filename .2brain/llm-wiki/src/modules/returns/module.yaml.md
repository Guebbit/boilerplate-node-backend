---
source: src/modules/returns/module.yaml
sha256: 73a0d42e94ada771df176e13cf65014062fa5eef0711e803e6cc9217bd537a19
generated_at: 2026-11-14T21:35:10.063503+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/module.yaml

## Purpose

Module manifest for the **returns** subdomain (shop group). Declares the module's metadata, cross-module dependencies, a write-path rate limit, and a scheduled cleanup job. It exists so the platform can wire up cross-cutting concerns (auth flags, delivery state, refunds, etc.) without each handler re-declaring them.

## Key elements

- **`summary` / `subdomain` / `group`** — Identity metadata: "Sending goods back, including the EU withdrawal button," scoped to the `supporting` subdomain under the `shop` group.
- **`dependsOn`** — Six module dependencies, each annotated with what it provides:
  - `access` – `ownOrderFlag` audit flag for the caller's own order.
  - `delivery` – shipped/remaining line state, cheapest standard delivery for withdrawal refunds, unit re-open for replacements, remainder cancellation.
  - `inventory` – re-listing received goods.
  - `orders` – the target order's lines, owner, and pre-dispatch cancel.
  - `payments` – refund issuance and the `PAYMENT_REFUNDED` event that closes a return.
  - `shop` – destination for returned goods and postage responsibility.
- **`rateLimits.returnsWrite`** — `POST /returns` limiter keyed on **ACCOUNT** (not address), default max 20 per shared window, configurable via `NODE_RETURNS_RATE_LIMIT_MAX`, audited.
- **`jobs.reapReturns`** — Cron `12 2 * * *` (02:12 daily). Unsets `note` and `declineMessage` free-text fields once a return has been idle for its retention window.

## Relationships

- **`src/modules/returns/openapi.yaml`** — The OpenAPI contract for this module's endpoints. This manifest supplies the module-level context (dependencies, rate limits, jobs) that the OpenAPI spec references or assumes; together they define the full surface of the returns API.

## Notes

- The rate-limit key is deliberately **ACCOUNT**, not the delivery address. The inline comment explains that an address-keyed budget would let one signed-in account behind a shared address starve all other callers on that address.
- `windowMs: shared` is a sentinel value meaning the window is inherited from a platform-wide shared setting rather than defined locally.
- `reapReturns` runs at 02:12 (minute 2, hour 12 in cron's 0-indexed convention — actually minute 02, hour 12, i.e. **12:02**). It only clears free-text fields; the return row itself is untouched.
