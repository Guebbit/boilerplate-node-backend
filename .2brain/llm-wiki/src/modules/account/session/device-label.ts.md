---
source: src/modules/account/session/device-label.ts
sha256: 3d4c126ad794d74e4b13b1263056360d3a7affe44cc9de295fd684515b2d2d41
generated_at: 2026-11-08T04:27:54.090527+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/device-label.ts

## Purpose

Provides a single pure function that turns a raw `User-Agent` header into a short, human-readable label (e.g. "Firefox on Linux"). The result is stored on the session at login so the account owner can distinguish their own devices in a list. It deliberately exposes only browser name and OS name—no versions, models, or IPs—minimizing the information retained in the session compared to the full UA kept in the 90-day audit log.

## Key elements

- **`describeDevice(userAgent?: string): string | undefined`** — The sole export. Slices the input to 512 chars, trims it, then uses `Bowser.getParser` to extract the browser name and OS name. Returns `"<Browser> on <OS>"`, just one of the two if only one is identified, or `undefined` when the UA names neither (scripts, `curl`, API testers).
- **`MAX_USER_AGENT_LENGTH` (512)** — Module-private constant that caps the parser input, bounding CPU work on an attacker-controlled header.

## Relationships

- **`package.json`** — Source of the `bowser` dependency imported at the top of this file.
- **`src/modules/account/session/cookie-strategy.ts`** — Sits in the same `session` directory; the module doc comment states the label is "stored on the session," indicating this file's output feeds into the session/cookie strategy at sign-in.
- **`src/modules/account/tests/unit/device-label.test.ts`** — Unit-test suite for `describeDevice`.

## Notes

- `Bowser.getParser` throws on an empty string, so the `!text` guard before calling it is load-bearing, not just defensive.
- The 512-char slice happens *before* the empty-check; a UA of only whitespace will pass the slice but still return `undefined` via `.trim()`.
- This is a pure, stateless function with no I/O—safe to call from request handlers without side effects.
- Design constraint (see `docs/theory/data-protection.md` referenced in the header comment): the label must never be more identifying than what the owner already knows about their own devices.
