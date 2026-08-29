# tests/unit/infrastructure/adapters/demo-outbox.test.ts

## Purpose

Unit tests for the demo profile's email-sink adapter (`demo-outbox`). They verify the recording, ordering, token-extraction, recipient-serialization, and reset behaviors of the outbox, ensuring that the token captured from email link URLs stays correct—a regression here would surface as a confusing "empty inbox" failure in a separate frontend repo's password-reset and verification suites.

## Key elements

- **`afterEach` block** — clears the outbox via `clearDemoOutbox()` and deletes `process.env.NODE_DEMO` to prevent cross-test contamination.
- **`is demo mode exactly when NODE_DEMO is the string true`** — asserts `isDemoMode()` returns `false` when the env var is absent and `true` only when it equals `'true'`.
- **`records newest first, with primitive template variables as readable lines`** — verifies `recordDemoEmail` stores entries newest-first and renders scalar template variables as `key: value` lines readable via `readDemoOutbox()`.
- **`lifts the token out of a link URL when no bare token variable exists`** — confirms the adapter extracts the trailing path segment of `linkUrl` and exposes it as `.token`.
- **`prefers a bare token variable over the link`** — confirms that a top-level `token` template variable takes precedence over URL extraction.
- **`serializes a structured recipient rather than losing it`** — ensures an object-shaped `to` (name + address) is flattened into a string containing the address.
- **`clears to an empty inbox`** — verifies `clearDemoOutbox()` resets the store to `[]`, matching the per-spec reset the demo router performs.

## Relationships

- **`src/infrastructure/adapters/demo-outbox.ts`** — the sole import target. All four exported functions (`clearDemoOutbox`, `isDemoMode`, `readDemoOutbox`, `recordDemoEmail`) are exercised directly; no other files are involved.

## Notes

- The header comment flags a cross-repo dependency: the `token` field is consumed by a paired frontend's specs, so a silent extraction bug fails *their* suites, not this one.
- Token-extraction precedence is an explicit contract: bare `token` variable wins over `linkUrl` parsing. Both paths are pinned by separate tests to guard against accidental reordering.
- `afterEach` resets `NODE_DEMO` in addition to the outbox; forgetting either can leak state into sibling test files running in the same worker.
