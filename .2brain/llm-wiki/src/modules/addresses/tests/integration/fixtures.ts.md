---
source: src/modules/addresses/tests/integration/fixtures.ts
source_sha256: 8e0c0015bcd75eaedec2db25163a77def06ca0bd962ffbe31e7f1d761fb4aeea
context_sha256: 8997af21376cb702981508c70b838c3753f54d34ca1ed75b7016881a3b3705ae
generated_at: 2026-11-22T04:16:39.644023+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/tests/integration/fixtures.ts

## Purpose
Shared test data for the address-book integration suites. It exports two constant address objects so tests use identical, predictable payloads instead of redefining them.

## Key elements
- `HOME`: address with label `home`, full name `Ada Lovelace`, street `Via Roma 1`, city `Modena`, zip `41121`, country `IT`.
- `OFFICE`: address with label `office`, same full name, street `Via Milano 2`, city `Modena`, zip `41122`, country `IT`. It is documented as a second address in the same town.

## Relationships
The neighbors in the dependency graph are the integration suites that use these fixtures:
- `addresses.test.ts`
- `checkout.test.ts`
- `idempotent-create.test.ts`

The file has no imports of its own, so it depends on nothing.

## Notes
- The two addresses share the same `fullName`, `city` and `country`. They differ in `label`, `street` and `zip`.
- The objects are plain, mutable literals with no `as const` or `Object.freeze`. A test that mutates one could affect other tests in the same module instance.
