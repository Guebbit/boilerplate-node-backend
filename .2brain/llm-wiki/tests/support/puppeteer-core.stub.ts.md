---
source: tests/support/puppeteer-core.stub.ts
sha256: 095df887ea6baf7e24b996e2124ab1f0939f0d1a71370267571422e4434c829d
generated_at: 2026-09-23T20:12:36.508617+00:00
model: ollama:qwen3.8:27b
---

# tests/support/puppeteer-core.stub.ts

## Purpose

Test-time stub that replaces `puppeteer-core` via Jest's `moduleNameMapper`. It exists because puppeteer-core v25 ships ESM-only (`type: module`), which cannot be parsed under this project's CJS Jest setup. Without the stub, any test that transitively reaches `adapters/pdf.ts` would fail at the parse stage rather than at an assertion.

## Key elements

- **`launch`** — The only function. Always throws an `Error` with a message pointing back to this file. Its signature is `(): never`, making it impossible to treat as a valid `puppeteer.LaunchResult`. The intent is that any test genuinely needing PDF rendering must supply its own `jest.mock` (as `tests/unit/infrastructure/adapters/pdf.test.ts` does) rather than relying on a silent no-op.
- **Default export** — A single object `{ launch }` matching the shape of the real `puppeteer-core` module's top-level API surface that the codebase actually imports.

## Relationships

No graph neighbors are recorded. The file is consumed implicitly by Jest's `moduleNameMapper` configuration; no other source file imports it directly.

## Notes

- The stub is deliberately a _loud_ replacement: it throws instead of returning a fake browser. This is a design choice to prevent tests from passing vacuously while asserting on undefined behavior.
- CI installs no Chromium, so no suite is expected to run real PDF rendering.
- See `docs/tools/unit-testing.md` (referenced in the file header) for the broader testing strategy behind this pattern.
