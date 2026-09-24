---
source: src/modules/antibot/index.ts
sha256: 5e4f217177128a0432fc07dd3a871da3ede409a8647756be0e18a0a4651c40e6
generated_at: 2026-09-23T18:22:33.055210+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/index.ts

## Purpose

Intentionally empty barrel file for the `antibot` module. It exists solely to satisfy the project convention (strategic-DDD §5) that every module directory exposes a barrel, even when that barrel has nothing to publish. All antibot logic lives in wiring files (`module.ts`, `routes.ts`, `controllers/`) or in cross-cutting infrastructure, none of which a barrel re-exports.

## Key elements

- **`export {}`** — the only statement. Marks the file as an ES module so the barrel convention holds without leaking any named exports.

## Relationships

No graph neighbors. Sibling modules (`account`, `feedback`) do **not** import from this file; they reach the antibot gate directly via `infrastructure/http/middlewares/human-challenge` (`humanChallengeGate`) and `infrastructure/adapters/antibot`.

## Notes

- The `eslint-disable` for `unicorn/require-module-specifiers` is load-bearing: removing it will cause lint failures on the empty `export {}`.
- Do not add re-exports here without first revisiting the strategic-DDD §5 rule; the module's design deliberately keeps its surface to zero.
- The doc comment references `docs/modules/antibot.md` for the module's actual architecture.
