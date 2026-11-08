---
source: tests/support/puppeteer-core.stub.ts
sha256: 2f07b4a6d4296cd28469aafa02dd47885566495e48eee18a480ae0dd5d4b66fa
generated_at: 2026-11-08T09:57:38.356982+00:00
model: ollama:qwen3.8:27b
---

# tests/support/puppeteer-core.stub.ts

## Purpose

A Jest module-mapping stub that replaces `puppeteer-core` for the entire test suite. It exists because puppeteer-core v25 ships `type: module` with no CommonJS build, making the real package unparseable under this project's CJS Jest configuration. Without this stub, any test that transitively imports `adapters/pdf.ts` (e.g. through a route table) would fail at the **parse** stage rather than at an assertion.

## Key elements

- **`launch`** (internal, not exported directly) — a function that unconditionally throws an `Error` identifying the stub and pointing the developer to this file. Intentionally typed as `(): never` so TypeScript callers know the call site is unreachable in tests.
- **`export default`** — an object `{ launch }` mirroring the real package's default-export shape, so `import puppeteer from 'puppeteer-core'` resolves without a parse error.

## Notes

- Wiring lives in `moduleNameMapper` (see `docs/tools/unit-testing.md`); this file contains no Jest configuration.
- The stub is a **fail-fast sentinel**, not a fake. Any suite that actually exercises PDF rendering must call `jest.mock('puppeteer-core', …)` in its own setup (the reference example is `tests/unit/infrastructure/adapters/pdf.test.ts`). A silent no-op here would let such a test pass vacuously.
- CI installs no Chromium, so nothing in the suite expects the real browser.
