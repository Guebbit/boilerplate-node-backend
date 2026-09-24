---
source: src/modules/webhooks/domain/event-filter.ts
sha256: f4b89a7a931c9c817b9bec0114ed3cd6abced533b2c0341f8470dd20beb9f8be
generated_at: 2026-09-23T19:39:38.877963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/domain/event-filter.ts

## Purpose

Pure, I/O-free decision logic that answers one question: _does a given event type belong to a subscription's `eventTypes` filter?_ Matching is exact-membership or the `'*'` wildcard—no glob or prefix matching. The module exists to keep the "should this subscriber receive this event?" check in the domain layer, independent of transport or storage concerns.

## Key elements

- **`ALL_EVENTS`** (`'*'`) — the single wildcard token that opts a subscription into every event in the catalogue, present or future.
- **`matchesEventFilter(eventType: string, filter: readonly string[]): boolean`** — returns `true` if `filter` contains `ALL_EVENTS` **or** contains the exact `eventType` string. No partial or pattern matching of any kind.

## Relationships

- **`src/modules/webhooks/domain/index.ts`** — barrel file that re-exports `ALL_EVENTS` and `matchesEventFilter` so other domain-layer imports can pull them from the package root.
- **`src/modules/webhooks/services/publish.ts`** — calls `matchesEventFilter` during event dispatch to decide which of a user's subscriptions should receive a given outgoing webhook.
- **`src/modules/webhooks/tests/unit/event-filter.test.ts`** — unit tests covering the exact-match and wildcard paths of `matchesEventFilter`.

## Notes

- The design deliberately rejects glob/prefix matching. The public event catalogue (exposed via `GET /webhooks/events`) is small and flat, so callers can simply enumerate the types they need. A pattern language would introduce edge cases for little gain.
- Because matching is a plain `Array.includes`, order and duplicates in `filter` are irrelevant, and the check is O(n) in the filter length.
- The module has **zero side effects** and no imports of its own beyond its two exports—safe to call anywhere without mocking.
