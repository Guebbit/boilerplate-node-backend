---
source: src/modules/account/tests/unit/device-label.test.ts
sha256: cc684ec2fa3dc03784a03c8991b1fe2df1d1be937831277d0733e6e0158b0131
generated_at: 2026-10-14T09:20:09.957810+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/device-label.test.ts

## Purpose

Unit tests for `describeDevice`, the function that maps a browser User-Agent string to a coarse display label (e.g. "Firefox on Linux"). The tests exist to pin down exactly which labels the function may produce, to enforce that labels stay coarse (no versions, models, or addresses), and to verify safe handling of missing, malformed, or adversarially large inputs.

## Key elements

- **Table-driven "labels a browser as" test** — asserts `describeDevice` returns the expected label for five real User-Agent strings (Firefox/Linux, Edge/Windows, Safari/macOS, Safari/iOS, Chrome/Android).
- **"names no version, model or address" test** — feeds a specific Pixel 8 / Android 14 UA and asserts the result contains no digits and no device-model string, enforcing the "kind of device, never one device" policy.
- **Table-driven "gives no label for" test** — asserts `describeDevice` returns `undefined` for absent, empty, blank, CLI (`curl`), API-client (`PostmanRuntime`), and garbage (2 000-char noise) inputs.
- **"reads a bounded prefix" test** — supplies a 100 000-character hostile string with the browser tokens buried at the tail; asserts no exception is thrown and the result is `undefined`, confirming the implementation scans only a bounded prefix.

## Relationships

- **`src/modules/account/session/device-label.ts`** — sole dependency. The test imports and exercises its single export `describeDevice`. No other modules are referenced.

## Notes

- The design contract tested here is *abstention over guesswork*: any input the function can't confidently classify must return `undefined`, never a fabricated label.
- Labels are intentionally coarse (browser kind + OS kind only). Any future refactor that adds versions or device models will break the "no version, model or address" test.
- The hostile-input test is a guard against unbounded string processing on caller-controlled header data (SSRF / DoS mitigation at the parser level).
