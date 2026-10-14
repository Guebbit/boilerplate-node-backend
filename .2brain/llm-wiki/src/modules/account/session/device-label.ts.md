---
source: src/modules/account/session/device-label.ts
sha256: 3d4c126ad794d74e4b13b1263056360d3a7affe44cc9de295fd684515b2d2d41
generated_at: 2026-10-14T08:59:42.440614+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/device-label.ts

## Purpose

Produces a short, privacy-conscious label for a sign-in's origin (e.g. "Firefox on Linux") by parsing the `User-Agent` header at login time. The label is stored on the session so the account owner can distinguish their own devices in a session list. It intentionally omits versions, models, and IPs to avoid singling out a device beyond what the owner already knows.

## Key elements

- **`describeDevice(userAgent: string | undefined): string | undefined`** — The sole export. Parses the (truncated) User-Agent via Bowser and returns `"<Browser> on <OS>"`, a single name if only one is resolvable, or `undefined` when neither can be identified (scripts, curl, API clients).
- **`MAX_USER_AGENT_LENGTH = 512`** — Constant that truncates the input before parsing, bounding work on an attacker-controlled header.

## Relationships

- **`package.json`** — Declares the `bowser` dependency used by `describeDevice` for regex-based browser/OS name extraction.
- **`src/modules/account/session/cookie-strategy.ts`** — The session-persistence layer where the resulting label string is stored alongside other session data after login.
- **`src/modules/account/tests/unit/device-label.test.ts`** — Unit tests covering `describeDevice`'s output shapes (both names, one name, neither, truncation, empty/undefined input).

## Notes

- `Bowser.getParser` throws on an empty string, so the `!text` guard before calling it is load-bearing—removing it would break on whitespace-only User-Agents.
- The function is intentionally *not* a class or factory; it is a pure, stateless mapping from a header value to a display string. Callers are expected to invoke it once at sign-in and persist the result rather than re-derive it per request.
- The 512-byte cap is a DoS guard, not a correctness limit; real User-Agents are a few hundred bytes, so truncation should never affect legitimate clients.
