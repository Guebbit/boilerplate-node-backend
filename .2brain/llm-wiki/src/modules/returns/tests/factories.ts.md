---
source: src/modules/returns/tests/factories.ts
source_sha256: 991af13e1915832210e4cbfd830838d3a1dfdbc5d7b9dfa3d187bdf67a12a38c
context_sha256: b2df8e9be7f2c172535ba325200823765993a53315de49ed598d7f7871293350
generated_at: 2026-11-22T07:33:08.565727+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/factories.ts

## Purpose
Test fixtures for the returns module, intended for tests in other modules. It writes minimal return documents straight into the database, bypassing the service layer. This suits tests that count returns by status and age and don't need lines, orders, or money.

## Key elements
- `BareReturn` (interface): the fields a count by status and age reads.
  - `status`: `'requested'` or `'approved'`.
  - `reason`: a string.
  - `daysAgo`: how many days ago the return was opened.
  - `proof?`: optional `true`. When set, a proof of sending is recorded.
- `insertBareReturns(rows)`: takes a `readonly BareReturn[]` and bulk-inserts them with `returnModel.collection.insertMany`. It returns a `Promise<unknown>`.
  - For each row it computes `opened = Date.now() - daysAgo * DAY_MS`.
  - It sets `status`, `reason` and `kind: 'return'`.
  - It sets `createdAt`, `requestedAt` and `decidedAt` all to `opened`.
  - It adds `proofOfSendingAt: opened` only when `proof` is truthy.

## Relationships
- `src/modules/returns/model.ts`: provides `returnModel`, whose raw collection is the insert target.
- `src/domain-primitives/time.ts`: provides `DAY_MS`, used to convert `daysAgo` into a timestamp.
- `src/modules/shop-tasks/tests/integration/digest.test.ts` and `work-summary.test.ts`: neighbors in the dependency graph, in the shop-tasks module. This matches the module doc's purpose of serving tests outside the returns module.

## Notes
- It uses `collection.insertMany` (the raw driver collection), not the Mongoose model API. This skips schema validation and defaults on purpose, so the inserted documents are intentionally incomplete.
- `requestedAt` and `decidedAt` are always set to the same instant as `createdAt`, even for `requested` rows. Tests should not read them as meaningful decision timestamps.
- Time is computed from `Date.now()` at insert, so any fake timers in the test affect the stored dates.
