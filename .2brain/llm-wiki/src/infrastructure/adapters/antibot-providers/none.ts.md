---
source: src/infrastructure/adapters/antibot-providers/none.ts
sha256: 259cd0c0015f44a9e05a48c5f38e68ded0f5d7da8ce9b711847cb7cb4b58138b
generated_at: 2026-09-23T17:37:37.909049+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/none.ts

## Purpose

Provides a no-op implementation of the `HumanChallengeProvider` interface that always succeeds. It is the default provider shipped with the codebase so that a fresh checkout, test suite, or demo runs without rendering a third-party widget or routing visitor traffic to an external service.

## Key elements

- **`noneProvider`** — A `HumanChallengeProvider` object export. Its members:
  - `name`: the string `'none'`.
  - `publicParameters()`: returns an empty object `{}` (no widget parameters to publish).
  - `verify()`: returns `Promise.resolve('ok')` (unconditionally passes every caller).

## Relationships

- **`src/infrastructure/adapters/antibot-providers/index.ts`** — Imports the `HumanChallengeProvider` type from this file's sibling. `noneProvider` is typed against that interface and is re-exported (or consumed) through the index barrel, making it selectable as the active provider.

## Notes

- This provider has no external side effects; `verify` never consults a network. If a test or demo is unexpectedly receiving a challenge widget, the configured provider is *not* this one.
- Because `publicParameters` always returns `{}`, any code that conditionally renders a widget based on parameter presence will skip rendering when this provider is active.
