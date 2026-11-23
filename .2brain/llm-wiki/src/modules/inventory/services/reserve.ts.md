---
source: src/modules/inventory/services/reserve.ts
source_sha256: db317dffa05a81003d1fe222e3bf16b0c834832b1f1fb88bc30c4f898e26e9aa
context_sha256: bfeb7746c18dddd468ca2f42b9470c034a711a2c6ab508965bd7683cb75f9d84
generated_at: 2026-11-22T05:23:20.213716+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/reserve.ts

## Purpose
Takes an inventory hold for an order: every line is reserved or none are. It writes an empty hold first, takes each line in its own transaction, and unwinds everything if any line is refused or throws.

## Key elements
- **`reserveForOrder(orderId, lines, holdMinutes = reservationTtlMinutes())`** is the exported entry point.
  - It inserts an empty hold with an expiry. The hold's unique `orderId` makes retries exactly-once: if the insert loses, it returns `{ held: true, expiresAt: <existing hold's expiry>, owed: [] }`.
  - It takes the lines in lock order inside a try block. On a refusal it reads the blocker's level and the product title back to build a `StockShortfall`, then unwinds. A thrown error unwinds the same way and is then rethrown.
  - It returns a `ReserveOutcome`: `held`, or the lines that fell short with what is actually available.
  - After the last line it clears the availability entries once for the lines taken.
- **`takeLine`** takes one line. A spilling, non-backorder line goes to `takeSpillLine`. Any other line is one transaction: `applyTransition` plus `pushed`.
- **`takeSpillLine`** takes a spilling line in a single transaction.
  - It takes the whole line from the shelf if it fits.
  - Otherwise it takes the shelf part and claims the rest from the backorder cap as an "owed" part.
  - If the cap refuses, it throws `OwedRefused` to abort, and the function returns `null`.
- **`pushed`** adds the taken parts to the hold in the same transaction as the counter changes. If the hold was already claimed, it throws `HoldClaimed`.
- **`giveBack`** unwinds an unfinished reserve through `releaseForOrder`. If the release fails, it logs the error rather than throwing, and clears availability for the products already taken.
- **`inLockOrder`** sorts lines by product id so two multi-line checkouts cannot refuse each other.
- **`takeReasonFor`** maps a `backorder` line to `StockMovementReason.backorder` and anything else to `reserve`.
- **`leftFor`** computes how many units a refused line could still have been given: shelf units, preorder room (`roomOn`), or both for a spilling line.
- **`owedPartsOf`** extracts the backorder parts of a line that was asked for as shelf units.
- **`OwedRefused`** and **`HoldClaimed`** are internal `Error` subclasses used to abort transactions.

## Relationships
- **`../repository`**: `reservationRepository` (`insertHold`, `findByOrderId`, `pushItems`) records and updates the hold, and `stockLevelRepository` reads the product's stock level.
- **`./transition`**: `applyTransition` moves the stock counters inside the caller's session.
- **`./holds`**: `releaseForOrder` performs the unwind.
- **`./availability`**: `forgetAvailability` clears availability entries.
- **`./types`**: `StockLine`, `StockShortfall` and `ReserveOutcome`.
- **`../domain`**: `roomOn` gives the remaining preorder allowance.
- **`../config`**: `reservationTtlMinutes` gives the default hold window.
- **`../model`**: `StockLevelDocument`.
- **`@infrastructure/runtime/database`**: `withTransaction` wraps each line's take.
- **`@infrastructure/adapters/logger`**: `logger` records rollback failures.
- **`@modules/products`**: `productService` supplies the product title for shortfalls.
- **`@domain-primitives/time`**: `MINUTE_MS` converts the hold window to milliseconds.

## Notes
- The hold is never deleted. A released hold ends as `released`, and a failed release leaves it `held` for the sweep to free later.
- Each line's counter moves and its hold update commit together. The hold therefore never lists a line whose counters did not move, even if the process dies between lines.
- Availability entries cannot roll back with a transaction. They are cleared once after the last line, and a refusal or throw is refreshed by the release that unwinds it.
- A hold already claimed by the sweep releases nothing in `giveBack`, so there is no double give-back.
- The ledger shows the take and the give-back as separate movements rather than netting them to nothing.
- Sorting uses `localeCompare` with a fixed `'en'` locale, so every worker orders ids the same way.
