---
source: src/modules/antibot/index.ts
sha256: 91e26d588d82aaa9247443a3459890f8df70a5ed1a0c995f56be2ac9cb0ef132
generated_at: 2026-10-29T03:11:51.327989+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/index.ts

## Purpose

Public barrel (entry point) for the `antibot` module. It is intentionally empty because, per the project's strategic DDD rule (`docs/theory/strategic-ddd.md` §5), sibling modules must import through this barrel—and everything this module owns is internal wiring (`module.ts`, `routes.ts`, `controllers/`) that a barrel never re-exports. The actual runtime concern (the `humanChallengeGate` middleware) is consumed by other modules via `infrastructure/` paths directly, bypassing this file entirely.

## Key elements

- **`export {}`** — A bare side-effect-free export that makes this file a valid ES module while publishing zero symbols. This is the entire public API.

## Relationships

No dependency-graph neighbors. This file imports nothing and exports nothing, so it has no runtime edges. Other modules (`account`, `tickets`) do **not** import from here; they depend directly on `infrastructure/http/middlewares/human-challenge` and `infrastructure/adapters/antibot`.

## Notes

- Do **not** add re-exports here without re-reading the DDD rule in `docs/theory/strategic-ddd.md` §5. The emptiness is the contract.
- If you need the antibot gate from another module, import the infrastructure paths directly—this barrel will never expose them.
- Module docs live at `docs/modules/antibot.md`.
