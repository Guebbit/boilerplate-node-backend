---
source: src/modules/addresses/config.ts
source_sha256: dd13300f9a4d1de7dd0580bc60920cf4cdcb0fff9e1e20e9fd3db975e155dc4f
context_sha256: 57d97d8f9f253726eea0d1be5a0cb6f1080f75244ca8603fb183d74f9b31dc77
generated_at: 2026-11-22T04:12:18.147281+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/config.ts

## Purpose
Defines the address module's configuration: a single setting capping how many entries one address book may hold. It exists so the limit is environment-configurable and validated through the shared config infrastructure.

## Key elements
- `addressesConfig`: config object created with `defineConfig`, named `'addresses'`. Its shape has one field, `NODE_ADDRESS_BOOK_MAX`, an `int` with default `20` and minimum `1`.
- `addressBookMax()`: returns `addressesConfig().NODE_ADDRESS_BOOK_MAX`, the cap on entries per book. This is the intended accessor for the value.

## Relationships
- `src/infrastructure/config/define.ts`: provides `defineConfig`, used to build `addressesConfig`.
- `src/infrastructure/config/fields.ts`: provides the `int` field builder used to declare `NODE_ADDRESS_BOOK_MAX`.
- `src/modules/addresses/module.ts` and `src/modules/addresses/repository.ts`: sibling files in the addresses module. The file content does not show how they use this config.

## Notes
- `addressesConfig` is called as a function (`addressesConfig()`) to read values, so access happens at call time rather than at import time.
- The cap exists because a book is stored as one document and its entries are PII-encrypted, which makes stored entries larger than the input. The default of 20 is described as generous for a person.
- The file's doc comment has a `@see` reference to the "who-owns-what" section of a configuration doc under `docs/operate/`.
