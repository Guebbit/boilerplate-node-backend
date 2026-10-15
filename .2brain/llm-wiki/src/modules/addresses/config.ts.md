---
source: src/modules/addresses/config.ts
sha256: 663c115b071ef52f20fc7eb9962eddd5be76e38a3adb3deab9c80a727d33a54c
generated_at: 2026-10-15T10:17:30.450589+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/config.ts

## Purpose

Defines the single tunable parameter for the address book module: the maximum number of entries one address book may hold. It exists to centralise that cap so both the module registration and the repository can read a consistent, validated value from one source.

## Key elements

- **`addressesConfig`** — The config object built with `defineConfig`. Declares one field, `NODE_ADDRESS_BOOK_MAX`, typed as `int` with `default: 20` and `min: 1`.
- **`addressBookMax()`** — A getter that returns the current value of `NODE_ADDRESS_BOOK_MAX` (reads from `addressesConfig()`). Used by callers that need the cap as a plain `number`.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the builder used to declare the config shape and name.
- **`src/infrastructure/config/fields.ts`** — Provides the `int` field descriptor (with `default` / `min` constraints) used to type the single config key.
- **`src/modules/addresses/module.ts`** — Imports this file to register the `addresses` config with the module system.
- **`src/modules/addresses/repository.ts`** — Calls `addressBookMax()` to enforce the per-book entry cap at read/write time.

## Notes

- The cap exists because an address book is stored as **one document** and its entries are PII-encrypted, making stored payloads larger than their plaintext input. Raising the cap increases per-document size.
- There is exactly one config field here; any additional per-book settings would live elsewhere (e.g., the address entity schema).
- `addressBookMax()` is a **function**, not a constant — it invokes `addressesConfig()` on each call so tests can swap the resolved value via the infrastructure config layer.
