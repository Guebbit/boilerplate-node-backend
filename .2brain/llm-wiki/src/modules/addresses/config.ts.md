---
source: src/modules/addresses/config.ts
sha256: 663c115b071ef52f20fc7eb9962eddd5be76e38a3adb3deab9c80a727d33a54c
generated_at: 2026-11-08T04:53:27.568975+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/config.ts

## Purpose

Defines the single configuration knob for the addresses module: the maximum number of entries a single address book may hold. It wraps that value in the project's typed-config infrastructure so other parts of the module can read it with validation.

## Key elements

- **`addressesConfig`** — A `defineConfig` instance named `"addresses"` with one shape field, `NODE_ADDRESS_BOOK_MAX`, typed as a positive integer (default 20, min 1).
- **`addressBookMax()`** — Convenience getter that returns the resolved cap as a plain `number`. Callers use this instead of touching the shape directly.

## Relationships

- **`src/infrastructure/config/define.ts`** — Supplies `defineConfig`, the factory used to build the typed config object.
- **`src/infrastructure/config/fields.ts`** — Supplies the `int` field validator (type, `default`, `min`) for the shape entry.
- **`src/modules/addresses/repository.ts`** — Consumes `addressBookMax()` to enforce the per-book entry cap when reading/writing books.
- **`src/modules/addresses/module.ts`** — Registers the addresses module; depends on this config being available at module init.

## Notes

- There is exactly **one** tunable here by design. The cap exists because a book is a single stored document and each entry is PII-encrypted, so stored size is larger than input size; the limit keeps document size bounded.
- The JSDoc points to `docs/tools/configuration.md` for operator-facing documentation of the knob.
- Use `addressBookMax()` rather than destructuring the shape; it keeps call sites decoupled from the config object's internal structure.
