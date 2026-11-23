---
source: src/modules/account/session/device-label.ts
source_sha256: 281b584107a67f338abd5a3a7ea5b9a4f86aef22ccc83a528eac9c3fd859ef97
context_sha256: ec8211e1f4c115518246b3bb8b9f76c8e25fa7b62930d49381506e6bc24ec905
generated_at: 2026-11-22T03:46:26.170006+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/device-label.ts

## Purpose
Produces a coarse, human-readable label for where a sign-in came from (e.g. "Firefox on Linux"). It is parsed once at login from the User-Agent and stored on the session, so the account owner can tell their own devices apart in the session list. It deliberately names only browser and system, with no version, model, or IP.

## Key elements
- `describeDevice(userAgent: string | undefined): string | undefined`: the only export.
  - Truncates the input to 512 characters (`MAX_USER_AGENT_LENGTH`) and trims it. Returns `undefined` if nothing is left.
  - Parses with Bowser (`getBrowserName()`, `getOSName()`).
  - Returns `"<browser> on <system>"` when both are known, whichever one is known when only one is, and `undefined` when neither is (scripts, `curl`, API testers).
- `MAX_USER_AGENT_LENGTH` (private, 512): bounds parser work on an attacker-controlled header.

## Relationships
- `package.json`: declares the `bowser` dependency that this file imports.
- `src/modules/account/session/cookie-strategy.ts`: a sibling in the session module. The file itself shows no link to it, and the doc comment says only that the label is stored on the session at login.
- `src/modules/account/tests/unit/device-label.test.ts`: the unit test for `describeDevice`.

## Notes
- Returning `undefined` is intentional: "no label beats a wrong one".
- The empty-string guard matters because Bowser's `getParser` throws on an empty string.
- The audit log separately keeps the raw User-Agent for 180 days. This label is a shorter, friendlier copy shown back to the person it describes.
