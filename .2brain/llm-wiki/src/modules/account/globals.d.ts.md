---
source: src/modules/account/globals.d.ts
sha256: e21f0c94e1a928dc4d25dd30208fc81bd554c4e45cbc74c66395ea65e3427b22
generated_at: 2026-11-14T18:36:06.624913+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/globals.d.ts

## Purpose

Augments the Express `Request` interface with an account-specific field (`credentialAttemptFailed`) via TypeScript declaration merging. It exists as a separate file because the infrastructure layer's `globals.d.ts` must remain module-agnostic (per `docs/theory/layers.md`), so any `Request` property that only the account module sets and reads is declared here.

## Key elements

- **`export {}`** — Promotes the file to a module. Without it the file is a global *script*, and `declare module 'express-serve-static-core'` would *redeclare* the module from scratch, silently erasing all properties Express's own types define on `Request`, `Response`, and `Express` across the entire program.
- **`declare module 'express-serve-static-core'` → `interface Request`** — Adds one optional property:
  - **`credentialAttemptFailed?: boolean`** — Set by the OAuth callback controller when a 302 redirect carries `?error=`. Read by `rate-limits.ts` credential budgets so that a "failed" OAuth attempt that still responds below 400 is counted against the caller's rate limit.

## Relationships

No graph neighbors are recorded for this file. It is an ambient type declaration with no runtime imports or exports (beyond the empty `export {}`), so it does not appear in the dependency graph as a source or target.

## Notes

- The `export {}` is load-bearing, not boilerplate. Removing it turns the augmentation into a full redeclaration and breaks every other `Request`/`Response`/`Express` type consumer in the project.
- This file is intentionally *not* imported by any runtime code; it is picked up by TypeScript's ambient type resolution. Do not add runtime `import`/`export` statements beyond the empty `export {}`.
