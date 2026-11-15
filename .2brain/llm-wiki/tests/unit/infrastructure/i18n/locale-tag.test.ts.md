---
source: tests/unit/infrastructure/i18n/locale-tag.test.ts
sha256: 381fe0287a497c42e3bc3c3eb11dab2e06a6ace18ba4d0bda480471c2fd58ea6
generated_at: 2026-11-15T00:24:55.761581+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/locale-tag.test.ts

## Purpose

Unit tests for the four locale-tag helpers exposed by the i18n infrastructure module. They lock down the contract that locale tags are compared case-insensitively, stored in a canonical form, and never cause a throw when the input is unrecognised.

## Key elements

- **`describe('canonicalLocale')`** — Verifies case normalisation (`pt-br` → `pt-BR`, `EN` → `en`), regional-subtag capitalisation (`zh-hant-tw` → `zh-Hant-TW`), legacy-code remapping (`iw` → `he`), and the "return as-written, never throw" behaviour for malformed inputs (`en-a`, `en_US`, `''`, `'e'`).
- **`describe('isWellFormedLocale')`** — Confirms the predicate accepts valid BCP-47-style tags (`en`, `PT-br`, `fil`, `zh-Hant-TW`) and rejects malformed ones (`en-a`, `en_US`, `''`, `'x'`).
- **`describe('baseLanguage')`** — Checks primary-subtag extraction (`pt-BR` → `pt`), case-insensitivity, legacy remapping (`iw` → `he`), and the fallback of returning the lowercased text before the first hyphen when parsing fails (`EN-a` → `en`).
- **`describe('canonicalLocaleSetter')`** — Asserts the setter trims whitespace and canonicalises a valid string (`'  pt-br '` → `'pt-BR'`), and passes non-string values (`42`, `undefined`) through untouched so the surrounding schema can reject them.

## Relationships

- **`src/infrastructure/i18n/locale-tag.ts`** — The module under test. All four functions (`canonicalLocale`, `isWellFormedLocale`, `baseLanguage`, `canonicalLocaleSetter`) are defined here.
- **`src/infrastructure/i18n/index.ts`** — The barrel re-export through which the tests import the functions (`@infrastructure/i18n`). The tests exercise the public API surface rather than reaching into the implementation file directly.

## Notes

- Tests import via the barrel (`@infrastructure/i18n`), not the direct `locale-tag` module path, so they also implicitly validate that the barrel re-exports are wired correctly.
- `canonicalLocaleSetter` is intentionally a *pass-through* for non-string inputs rather than throwing; the design delegates type validation to the outer Zod/schema layer.
- The legacy two-letter code `iw` (Hebrew) is a recurring test fixture across three of the four `describe` blocks, flagging it as a known edge case the implementation must handle consistently.
