---
source: src/modules/orders/config.ts
sha256: 73870ac8dad61b7fd30af37d46e849e19ecad76a3010e79887efd75f4c2bc162
generated_at: 2026-09-27T15:06:57.873062+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/config.ts

## Purpose

Central configuration surface for the `orders` module. Exposes the shop's invoice identity, bank-transfer payment settings, invoice-render cache knobs, the refund-retry grace window, and the single frontend order-page link. Every getter reads its env var **per call** (not captured at import), following the pattern set by `inventory/config.ts`, so a deployment can correct any value without a restart.

## Key elements

- **`shopCountry()`** – ISO-3166 country the shop is in; the sole VAT jurisdiction.
- **`shipToCountries()`** – comma-separated ISO-3166 codes this deployment ships to; defaults to `[shopCountry()]`; each code upper-cased.
- **`shopVatNumber()`**, **`shopLegalName()`** – optional identity fields printed on invoices.
- **`shopCurrency()`** – single ISO-4217 code (defaults to `'EUR'`); owned here, not in `payments`.
- **`bankTransferBeneficiary()`**, **`bankTransferIban()`**, **`bankTransferBic()`** – raw transfer account details; beneficiary + IBAN both set ⇒ transfer offered.
- **`bankTransferIbanFriendly()`** – IBAN grouped in 4-char blocks for the customer-facing instructions (manual chunking, no `ibantools` import).
- **`bankTransferHoldHours()`** – stock-reservation window for `bank_transfer` orders (default 168 h).
- **`bankTransferMaxOpenPerAccount()`** – cap on concurrent pending-transfer orders per account (default 2).
- **`bankTransferEnabled()`** – `true` only when both beneficiary and IBAN are configured.
- **`transferInstructionsFor(reference)`** – builds the `OrderTransferInstructions` object; caller is responsible for all guards.
- **`invoiceCachePath()`** – resolved directory for rendered-invoice cache; must stay outside `NODE_PUBLIC_PATH`.
- **`invoiceCacheTtlMinutes()`** – cache TTL in minutes; forced to `0` under `isDemoMode()` or `NODE_ENV=test` (never touches disk).
- **`orderEffectRetryMinutes()`** – grace window before the sweep retries a failed refund (default 5 min).
- **`orderFrontendLink({locale, id})`** – resolves the paired-frontend order-page URL via `frontendLink`.
- **`ORDER_LINK_ENV_VAR`**, **`ORDER_LINK_DEFAULT_TEMPLATE`** – internal constants for the link; not exported.

## Relationships

- **`@infrastructure/runtime/environment`** – provides `environmentNumber`, used by every numeric getter (`bankTransferHoldHours`, `bankTransferMaxOpenPerAccount`, `invoiceCacheTtlMinutes`, `orderEffectRetryMinutes`).
- **`@infrastructure/runtime/demo-profile`** – provides `isDemoMode`, consulted inside `invoiceCacheTtlMinutes` to force TTL to 0.
- **`@infrastructure/http/frontend-link`** – provides `frontendLink`, the only caller is `orderFrontendLink`; the infrastructure layer stays module-agnostic.
- **`src/modules/orders/emails.ts`** – sole reader of `shopCountry`, `shopVatNumber`, `shopLegalName` for the invoice payload.
- **`src/modules/orders/services/index.ts`** – barrel re-exports the bank-transfer getters so `payments` and `cart` can read them without importing this file directly (barrel may only publish services/domain/events/emails/model, never a bare config).
- **`src/modules/cart/services/checkout.ts`** – consumes `shipToCountries` and `bankTransferEnabled` via the barrel.
- **`src/modules/orders/services/place.ts`** – enforces `bankTransferMaxOpenPerAccount` at order creation.
- **`src/modules/orders/services/invoice.ts`** – reads `invoiceCachePath`, `invoiceCacheTtlMinutes`, and shop-identity getters.
- **`src/modules/orders/services/cancel.ts`** – reads `orderEffectRetryMinutes` for the refund-retry window.
- **`src/modules/orders/model.ts`** – `applyTransferInstructions` mirrors the "read live, don't freeze at checkout" convention established here.
- **`src/modules/orders/tests/unit/config.test.ts`** – direct unit tests for every getter in this file.

## Notes

- **Per-call reads, not module-level constants.** Every exported function is a zero-arg (or single-arg) getter that reads `process.env` at invocation time. Tests can vary values per case; a deployment can flip a setting and it applies on the next call without a restart.
- **`invoiceCachePath` must stay outside `NODE_PUBLIC_PATH`.** Invoices carry PII and must only be reachable through the authenticated `GET /orders/{id}/invoice` route, never as a guessable static URL.
- **`invoiceCacheTtlMinutes` ignores the env var entirely** when `isDemoMode()` or `NODE_ENV=test` is active — the `0` TTL means the render never writes to disk, so no PII is left behind.
- **`bankTransferIbanFriendly` does its own 4-char chunking** rather than importing `ibantools`, preserving `ibantools`' single-module ownership in the generated dependency docs.
- **`shopCurrency` defaults to `'EUR'`** (uses `??` not `||`), so an empty-string env var would *not* fall through — an intentional distinction from the `|| undefined` pattern used by the optional getters.
- **VAT *rates* are not here.** They live in `@modules/products`'s `config.ts`; this module only freezes the rate it is handed.
- **Barrel restriction:** `services/index.ts` may re-export config values only as part of the allowed public surface (services/domain/events/emails/model). A bare `config` import from outside `orders` is forbidden (`local/barrel-allowed-sources` lint rule).
