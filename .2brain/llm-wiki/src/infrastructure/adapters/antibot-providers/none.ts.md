---
source: src/infrastructure/adapters/antibot-providers/none.ts
sha256: 259cd0c0015f44a9e05a48c5f38e68ded0f5d7da8ce9b711847cb7cb4b58138b
generated_at: 2026-11-08T03:17:01.583662+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/none.ts

## Purpose

A no-op implementation of the human-challenge provider that always passes verification and renders no widget. It is the default provider so that a boilerplate checkout, test suite, or demo run never contacts a third-party anti-bot service.

## Key elements

- **`noneProvider`** (exported const, typed as `HumanChallengeProvider`):
  - `name`: `'none'`
  - `publicParameters()`: returns an empty object — there is nothing to inject into the page.
  - `verify()`: always resolves to `'ok'`.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/index.ts`** — `none.ts` imports the `HumanChallengeProvider` interface from this file and provides a concrete object that satisfies it. The index module defines the contract; this file supplies the "do nothing" implementation.

## Notes

- This is intentionally the only provider with zero external dependencies — no network call, no DOM manipulation, no configuration. Treat it as the null-object for the anti-bot pipeline.
- Because `verify` is a bare `Promise.resolve`, it carries no async logic; any code path that awaits it will always see `'ok'`.
