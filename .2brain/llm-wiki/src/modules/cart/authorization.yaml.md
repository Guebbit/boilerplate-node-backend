---
source: src/modules/cart/authorization.yaml
sha256: 7eb676c0d80892714c1be643182ef0bcc9996adf07f8d95748ca75e0fd7b3676
generated_at: 2026-11-08T05:11:00.223105+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/authorization.yaml

## Purpose

Defines the single authorization rule for the cart module: verifying that a caller's account has a confirmed email before they can *spend* their basket (i.e., check out). Cart contents themselves (add, remove, set-quantity) are intentionally rule-free; only the act of spending is gated because it is a fact about the account, not the basket.

## Key elements

- **`rules`** — Contains one rule: `checkout` on subject `Cart`, scoped `tenant`, module `cart`. Its `deniedCode` is `EMAIL_NOT_VERIFIED`, which drives a specific 403 message ("confirm your email") rather than the generic `requirePermission` text.
- **`sets.CartCheckout`** — A named rule set that bundles the single `checkout:Cart` rule for consumers that need a pre-packaged permission group.

## Relationships

- **`src/modules/cart/openapi.yaml`** — The OpenAPI spec declares the cart endpoints (including checkout). This file is the authorization layer that gates those endpoints at the route level; the `checkout` rule is the permission checked before a checkout route handler executes.

## Notes

- The action is deliberately `checkout`, **not** `create:Order`. `create:Order` is reserved for staff raising an order on someone else's behalf; reusing it here would produce an identical CASL tuple once packed for the browser, making the two permissions indistinguishable. See `docs/theory/authorization.md` for the full rationale.
- `deniedCode` uses kebab-cased form (`EMAIL_NOT_VERIFIED`) and is looked up via `t('generic.error-<deniedCode>')`. This is the only cart rule that overrides the default 403 wording.
- "Using a basket at all is no rule": every signed-in account, including staff, can read and mutate their own cart without a permission check.
