---
source: src/modules/orders/config.ts
sha256: 76b467e69d916c774f616a980a431f4cdb161c83b5e3b44371b204306e0ffbfb
generated_at: 2026-09-23T18:59:56.397067+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/config.ts

## Purpose

Centralises the shop's invoice identity (legal name, VAT number, country), the bank-transfer payment-method configuration (beneficiary, IBAN, BIC, hold window, per-account open-order cap), and the invoice render-cache knobs (path, TTL). All values are read per call from `process.env` rather than captured at import, so a deployment can correct any of them without a restart. Owned by `orders` because `./emails` is the sole reader of the shop identity, and the transfer business rules (hold, cap) constrain the order entity itself.

## Key elements

- **`shopCountry()`** – ISO-3166 country code for VAT; the only jurisdiction charged.
- **`shopVatNumber()`** – VAT ID printed on invoices; `undefined` if unregistered.
- **`shopLegalName()`** – Legal name (not brand) for invoice header.
- **`invoiceCurrency()`** – ISO-4217 code; defaults to `'EUR'`. Same env var as `payments/config.ts#defaultCurrency`, duplicated because `orders` cannot import `payments`.
- **`bankTransferBeneficiary()`** / **`bankTransferIban()`** / **`bankTransferBic()`** – Account details; beneficiary + IBAN together gate `bankTransferEnabled()`.
- **`bankTransferIbanFriendly()`** – IBAN stripped of whitespace and chunked into 4-character blocks (simple regex, not `ibantools`).
- **`bankTransferHoldHours()`** – Stock reservation window for pending transfer orders (default 168 h).
- **`bankTransferMaxOpenPerAccount()`** – Max simultaneous `pending` transfer orders per account (default 2).
- **`bankTransferEnabled()`** – `true` when both beneficiary and IBAN are set.
- **`invoiceCachePath()`** – Resolved directory for cached invoice renders (default `tmp/storage/invoices`).
- **`invoiceCacheTtlMinutes()`** – Cache TTL in minutes (default 5); forced to `0` (no disk I/O) when `isDemoMode()` or `NODE_ENV === 'test'`.

## Relationships

- **`@infrastructure/runtime/environment`** (`environment.ts`) – provides `environmentNumber()` used by the three numeric getters (hold hours, max open, cache TTL).
- **`@infrastructure/runtime/demo-profile`** (`demo-profile.ts`) – provides `isDemoMode()`; `invoiceCacheTtlMinutes` short-circuits to `0` when it is true.
- **`src/modules/orders/emails.ts`** – sole consumer of `shopCountry`, `shopVatNumber`, and `shopLegalName` for the invoice payload.
- **`src/modules/orders/services/index.ts`** – re-exports these getters publicly; `cart/checkout` and `payments` consume bank-transfer config through this barrel rather than importing this file directly.
- **`src/modules/cart/services/checkout.ts`** – reads `bankTransferEnabled`, `bankTransferHoldHours`, `bankTransferMaxOpenPerAccount` via the barrel re-export.
- **`src/modules/payments/config.ts`** – reads the same `NODE_DEFAULT_CURRENCY` var independently; `orders` cannot import `payments` (dependency direction). `payments` also calls `ibantools` to validate the IBAN returned by `bankTransferIban()`.
- **`src/modules/orders/services/invoice.ts`** – reads `invoiceCachePath` and `invoiceCacheTtlMinutes` to govern disk caching.
- **`src/modules/orders/tests/unit/config.test.ts`** – unit tests for every getter in this file.

## Notes

- **Per-call reads, not module-level constants.** Deliberate pattern (also used in `inventory/config.ts`); do not refactor to top-level `const` captures without a design change.
- **`bankTransferIbanFriendly` is intentionally a 4-char regex chunk**, not `ibantools`' `friendlyFormatIBAN`. The `ibantools` import stays single-module-owned by `payments`; duplicating it here would break the generated `docs/tools/package-dependencies.md` page.
- **`invoiceCachePath` must resolve outside `NODE_PUBLIC_PATH`.** Invoices carry PII; they are only served via the authenticated `GET /orders/{id}/invoice` route, never as a static asset.
- **Cache TTL is hard-zeroed in demo/test** regardless of the env var, so no PII is left on disk in those modes.
- **VAT _rates_ are not here.** They are resolved by `products`' own `config.ts`; this module only freezes the number it is handed.
- **`shopCountry` is boot-required via the module manifest**, yet read with a `|| undefined` fallback because `NODE_ENV=test` and the demo profile both skip the boot check.
