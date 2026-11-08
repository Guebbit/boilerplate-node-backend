---
source: src/modules/locales/tests/factories.ts
sha256: e509b3c8966f2dfe757431c1d354b7a7feef7a222b4966977d9221f51fcb4d57
generated_at: 2026-11-08T06:27:37.722745+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/factories.ts

## Purpose

Test-only persistence layer for the locale domain. It wraps the production builder (`makeLocale`) with a database write so integration and contract tests can seed a known locale row without hand-rolling repository calls. The design splits "build" (in `../factories.ts`) from "persist" (here) so the builder stays unit-testable without a database.

## Key elements

- **`givenLocale(tag, overrides?)`** — Creates and persists a `LocaleDocument` where `name` and `nativeName` default to the BCP-47 `tag`. Accepts an optional `overrides` object (currently only `active?: boolean`) to e.g. mark a locale as disabled. Returns the persisted document.

## Relationships

- **`src/modules/locales/factories.ts`** — Provides `makeLocale`, the pure builder that constructs the `LocaleDocument` in-memory.
- **`src/modules/locales/repository.ts`** — Provides `localeRepository.create`, which writes the document to the test database.
- **`src/modules/locales/model.ts`** — Source of the `LocaleDocument` type annotation.
- **Consumer test files** (e.g. `tests/integration/language-negotiation.test.ts`, `tests/integration/draft-language-never-leaks.test.ts`, `src/modules/sitemap/tests/integration/sitemap.test.ts`, `tests/contract/product-write.test.ts`, and others) — Import `givenLocale` to seed locale rows before exercising locale-scoped behavior.

## Notes

- `name` and `nativeName` are hard-coded to the tag. If a test actually asserts on display names, it must build and persist the locale manually rather than calling `givenLocale`.
- The `overrides` parameter is intentionally minimal (`active` only). Adding fields here will require updating the signature; there is no spread-into-arbitrary-fields contract.
