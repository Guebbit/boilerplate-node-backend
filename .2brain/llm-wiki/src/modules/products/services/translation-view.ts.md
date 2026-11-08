---
source: src/modules/products/services/translation-view.ts
sha256: 0f4d66764aa962d48d463e85ac739c53b11e1e575e28c9edc93c4d06aee7bd92
generated_at: 2026-11-08T07:49:09.089246+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/translation-view.ts

## Purpose

Read-gate for a product's `translations` field. Editor tabs need every locale's copy (including drafts), which exceeds the resolved `title`/`description` a shopper sees, so this module exposes a single capability check that restricts access to callers holding the `read:Translation` grant.

## Key elements

- **`canSeeTranslations(caller?: Caller): boolean`** — The sole export. Returns `true` only when a caller is present **and** `holds(caller, 'read', 'Translation')` passes. Explicitly never checks write keys (e.g. `update:Product`); read and write are separate grants.

## Relationships

- **`src/kernel/ability.ts`** — Provides the `holds` function used as the single authorization primitive.
- **`src/types/index.ts`** — Barrel import (`@types`) that supplies the `Caller` type.
- **`src/types/auth-context.ts`** — Upstream definition of `Caller`, re-exported through the barrel above.
- **`src/modules/products/routes.ts`** — Consumer in the same feature module; the product routes are the expected callers of this gate before exposing `translations` in a response.
- **`src/modules/products/services/read.ts`** — Sibling read-service that performs the actual data fetch; this file only decides *whether* that fetch's `translations` slice may be included.

## Notes

- The JSDoc calls out that the field-level shape mirrors `./stock-view`; if you add a new gated field, keep the two view modules in lock-step.
- `caller` is intentionally typed as `Caller | undefined` to model anonymous requests; the function short-circuits to `false` without touching `holds`.
- The ability key is the composite string `'read', 'Translation'` (two args to `holds`), not a single `'read:Translation'` token — pass them separately.
