---
source: src/modules/account/session/device-label.ts
sha256: 148ee2b9e57dfeba37bac75b646db9971649a0a56d60c4ee3bbcd219bb15a17f
generated_at: 2026-11-14T18:56:50.033842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/device-label.ts

## Purpose

Parses the `User-Agent` header at sign-in into a short, human-readable device label (e.g. `"Firefox on Linux"`) that is stored on the session so an account owner can distinguish their own devices in a sign-in list. Deliberately omits version numbers, model names, and IP addresses to avoid creating an identifier beyond what the owner already knows (see `docs/theory/data-protection.md`).

## Key elements

- **`describeDevice(userAgent?: string): string | undefined`** — The sole export. Trims and caps the input at 512 characters, runs it through **Bowser**, and returns `"<Browser> on <OS>"`, a single name when only one is recognisable, or `undefined` when neither is (e.g. `curl`, headless scripts).
- **`MAX_USER_AGENT_LENGTH` (512)** — Internal constant; bounds the parser's work on an attacker-controlled header.

## Relationships

- **`cookie-strategy.ts`** — Sibling module in the same `session/` directory. `describeDevice` produces the label that the cookie/session strategy stores alongside the session so it can be displayed back to the user.
- **`device-label.test.ts`** — Unit-test file covering the parsing, the single-name fallback, the `undefined` path, and the length-cap behaviour.
- **`package.json`** — Provides the `bowser` runtime dependency used by this file.

## Notes

- The function is intentionally **pure** (string in → string/undefined out) with no I/O, making it trivial to test and to call from any session-entry point.
- `Bowser.getParser` throws on an empty string; the early `if (!text) return undefined` guard exists specifically to avoid that.
- When both browser and OS are unknown Bowser returns `''` for each; the final `browser || system || undefined` chain relies on that falsy behaviour to fall through to `undefined` rather than producing an empty string.
- The 512-char slice happens **before** `.trim()`, so a pathologically long whitespace-padded header is bounded first.
