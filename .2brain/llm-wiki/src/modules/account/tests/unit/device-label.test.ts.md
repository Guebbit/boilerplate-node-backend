---
source: src/modules/account/tests/unit/device-label.test.ts
sha256: cc684ec2fa3dc03784a03c8991b1fe2df1d1be937831277d0733e6e0158b0131
generated_at: 2026-11-08T04:46:27.860516+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/device-label.test.ts

## Purpose

Unit tests for `describeDevice`, the function that turns a raw `User-Agent` string into a coarse "browser on OS" label stored during cookie-mode sign-in. The tests pin the parser against real-world agent strings and guard against over-specific (leaky) or crashing (hostile) outputs.

## Key elements

- **`describeDevice` (imported)** — the function under test; maps a User-Agent to a short label like `"Firefox on Linux"` or returns `undefined` when no confident match is possible.
- **"labels a browser as …" table** — five parameterised cases (Firefox/Linux, Edge/Windows, Safari/macOS, Safari/iOS, Chrome/Android) that lock in the exact expected label strings.
- **"names no version, model or address" case** — asserts the label contains no digits and no device model name, enforcing the "a kind of device, never one device" privacy rule.
- **"gives no label for …" table** — six negative cases (undefined, empty, blank, `curl`, Postman, 2 000-char noise) that must all return `undefined`.
- **"reads a bounded prefix" case** — feeds a 100 000-char prefix to confirm the function neither throws nor matches, i.e. it reads only a bounded slice of the caller-controlled header.

## Relationships

- **`src/modules/account/session/device-label.ts`** — sole import. This file exercises its single export `describeDevice` and asserts on its return values; no other module is touched.

## Notes

- The test file is a `@module` (no named exports); it relies entirely on Jest globals (`describe`, `it`, `expect`).
- The hostile-input test is a security/DoS guard: the contract is "bounded read, never throw," not "parse the whole string."
- The negative-case table encodes a product decision ("none beats a wrong one"): ambiguous or non-browser agents must yield `undefined`, not a best-guess label.
