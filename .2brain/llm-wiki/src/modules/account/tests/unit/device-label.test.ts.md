---
source: src/modules/account/tests/unit/device-label.test.ts
source_sha256: cc684ec2fa3dc03784a03c8991b1fe2df1d1be937831277d0733e6e0158b0131
context_sha256: e2f81321522b8f37123d0739527d4303d8e01b539f484886ed56db950bbb239f
generated_at: 2026-11-22T04:04:52.601691+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/device-label.test.ts

## Purpose
Unit tests for `describeDevice`, which produces the device label stored on a cookie-mode sign-in: a coarse "browser on system" string derived from a User-Agent header. The cases use real User-Agent strings, so the parser is checked against agents seen in practice.

## Key elements
- **Table-driven label test** (`it.each`): maps real User-Agent strings to expected labels:
  - Firefox on Linux
  - Microsoft Edge on Windows
  - Safari on macOS
  - Safari on iOS
  - Chrome on Android
- **No-detail test**: for an Android/Pixel 8 Chrome agent, the label contains no digits and does not contain `Pixel`. A label names a kind of device, never one device.
- **No-label test** (`it.each`): `describeDevice` returns `undefined` for these inputs:
  - `undefined`
  - an empty string
  - a blank string
  - `curl/8.5.0`
  - `PostmanRuntime/7.39.0`
  - a 2000-character junk string
- **Hostile-header test**: a 100,000-character prefix followed by `Firefox/130.0 (X11; Linux x86_64)` must not throw and must return `undefined`.

## Relationships
- Imports `describeDevice` from `@modules/account/session/device-label` (`src/modules/account/session/device-label.ts`), the only unit under test. The tests define its expected contract.

## Notes
- Returning `undefined` is preferred over a wrong guess, per the test titles ("none beats a wrong one"). Non-browser clients get no label.
- The hostile-header test implies the implementation reads only a bounded prefix of the header. A browser token placed after 100,000 characters of padding is not recognised. The caller controls this header.
- The tests use Jest/Vitest-style globals (`describe`, `it`, `expect`) with no explicit imports.
