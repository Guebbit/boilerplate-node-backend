---
source: src/modules/cart/module.yaml
sha256: cafc30badc023702e14aa0a94f71decf2dcd2b8fd08503dea0f8d0d818724bf8
generated_at: 2026-11-08T05:14:52.936761+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/module.yaml

## Purpose

Module descriptor for the cart subdomain. It declares the module's position in the architecture (core/shop), enumerates its runtime dependencies with the specific data each one supplies, and defines rate-limit policies for the two write endpoints (`POST /cart/checkout` and `POST /cart/merge`). It does not define routes or schemas — that lives in the sibling OpenAPI spec.

## Key elements

- **`summary`** — one-line human description of the module's responsibility (per-user cart + checkout transaction).
- **`subdomain: core` / `group: shop`** — architectural classification; tells the loader where this module sits.
- **`dependsOn`** (8 entries) — ordered list of modules the cart must resolve at runtime. Each entry carries an inline comment naming the exact symbol or data it consumes (e.g. `orders → placeOrder`, `payments → listPaymentMethods`).
- **`rateLimits.checkout`** — config for the checkout endpoint: 10 req/`shared` window by default, overridable via `NODE_CHECKOUT_RATE_LIMIT_MAX`, keyed on **account** (not address), audited.
- **`rateLimits.cartMerge`** — config for the merge endpoint: 10 req/`shared` window, overridable via `NODE_CART_MERGE_RATE_LIMIT_MAX`, every request counts regardless of line count (up to 100), audited.

## Relationships

- **`src/modules/cart/openapi.yaml`** — the OpenAPI contract for the cart module. `module.yaml` references the two endpoints defined there (`POST /cart/checkout`, `POST /cart/merge`) in its rate-limit keys and `bounds` prose; `openapi.yaml` does not import `module.yaml` directly but the runtime reads both together.

## Notes

- `windowMs: shared` is a sentinel, not a literal millisecond value — the actual window is resolved elsewhere in the runtime (likely a shared/global constant).
- The `bounds` field is free-text rationale, not a machine-readable rule. It exists to document *why* the keying choice was made (e.g. account-keyed vs. address-keyed for checkout).
- `audited: true` on both rate limits means a hit on the limit produces an audit log entry; this is a runtime concern, not a config toggle visible in the API.
- The `dependsOn` list is the authoritative source of what the cart module may import at load time; adding a new module dependency here is required before the code can reference it.
