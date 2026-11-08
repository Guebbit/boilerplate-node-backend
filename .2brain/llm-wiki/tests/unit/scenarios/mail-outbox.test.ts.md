---
source: tests/unit/scenarios/mail-outbox.test.ts
sha256: eaa71051d8f6a1251564498d1287013aa25a243fcb3bb4abf320102aa97ce649
generated_at: 2026-11-08T10:29:43.261903+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/mail-outbox.test.ts

## Purpose

Unit test suite for the `outbox` mail transport double used by the demo profile. It pins down the recording, ordering, token-extraction, locale, and attachment semantics of the in-memory mail sink so that regressions (especially around `token` lifting from link URLs) are caught here rather than surfacing as opaque "empty inbox" failures in the paired frontend's password-reset and verification specs.

## Key elements

- **`afterEach` hook** — calls `clearDemoOutbox()` to reset state between tests.
- **Recording & ordering test** — verifies `readDemoOutbox()` returns newest-first and that primitive template variables render as `"key: value"` lines.
- **Locale tests** — confirms `locale` is carried through only when present in the send's data; absent → `undefined`.
- **Token extraction tests** (four cases) — validates that `token` is lifted from a `#token=` URL fragment, that a bare `token` variable takes precedence over the link, that surrounding query parameters don't break extraction, and that a tokenless link yields `undefined`.
- **Clear test** — asserts `clearDemoOutbox()` empties the inbox to `[]`.
- **Attachment tests** — records only the `filename` (not bytes); omits the `attachments` field entirely when none were sent.

## Relationships

- **`scenarios/support/doubles/mail-outbox.ts`** — sole import source. This test file exercises the three exported functions (`recordDemoEmail`, `readDemoOutbox`, `clearDemoOutbox`) and their side-effecting state (the in-memory outbox array). The double is the only production code under test; no other modules are involved.

## Notes

- **Cross-repo blast radius:** the file's doc comment explicitly warns that a token-extraction regression will break suites in *another* repo with a misleading "empty inbox" message. Treat the token tests as a contract, not just local behavior.
- **Token priority is strict:** bare `token` variable > `#token=` fragment > `undefined`. The order is asserted by two separate tests, not one.
- **Attachments are metadata-only:** the double deliberately discards content/bytes; tests assert the `key` field is *not* surfaced, only `filename`.
- **`readDemoOutbox()` returns an array (newest-first), not a single object.** Destructuring order in assertions (`const [newest, oldest] = …`) is load-bearing.
