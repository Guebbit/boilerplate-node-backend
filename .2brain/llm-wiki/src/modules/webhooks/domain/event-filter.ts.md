---
source: src/modules/webhooks/domain/event-filter.ts
sha256: f4b89a7a931c9c817b9bec0114ed3cd6abced533b2c0341f8470dd20beb9f8be
generated_at: 2026-11-08T09:02:35.005229+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/domain/event-filter.ts

## Purpose

Pure decision function that answers a single question for the webhook publish pipeline: does a given event type match a subscription's `eventTypes` filter? It exists to keep the matching rule (exact membership or the `'*'` wildcard) in one place, decoupled from the I/O concerns of actually delivering webhooks.

## Key elements

- **`ALL_EVENTS`** — exported constant with the value `'*'`; the sole wildcard that opts a subscription into every event the catalogue names, present or future.
- **`matchesEventFilter(eventType: string, filter: readonly string[]): boolean`** — returns `true` if `filter` contains `ALL_EVENTS` **or** the exact `eventType` string. No I/O, no side effects.

## Relationships

- **`src/modules/webhooks/domain/index.ts`** — barrel file; re-exports this module so consumers of the webhooks domain layer can import `matchesEventFilter` and `ALL_EVENTS` without reaching into the file path directly.
- **`src/modules/webhooks/services/publish.ts`** — primary consumer; calls `matchesEventFilter` to decide whether an event should be delivered to each subscribed endpoint.
- **`src/modules/webhooks/tests/unit/event-filter.test.ts`** — unit tests covering the wildcard, exact-match, and non-match paths.

## Notes

- **No glob or prefix matching, by design.** The public event catalogue is small and flat (see `GET /webhooks/events`), so a pattern language would add edge cases for a list callers can simply enumerate. If you need broader matching, add the specific event types to the filter rather than introducing a pattern syntax.
- `filter` is typed `readonly string[]`, so callers can pass a literal or `as const` array without worrying about mutation.
- The check is a flat `Array.includes` — no sorting, case-folding, or normalisation is performed. Event type strings are compared byte-for-byte.
