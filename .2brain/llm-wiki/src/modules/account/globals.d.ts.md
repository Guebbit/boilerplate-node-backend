---
source: src/modules/account/globals.d.ts
source_sha256: 7416ad01c284e6478fd6ef9217b8de0695593edd2bff73f0465cb03638641883
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T03:29:40.523345+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/globals.d.ts

## Purpose
Type-only declaration file that adds an `account`-specific field to Express's `Request` interface via declaration merging. Infrastructure's global declarations must not name a module, so a field that only `account` sets and reads is declared here instead.

## Key elements
- `export {}`: makes the file a module rather than a global script. This is required. In a script, `declare module` would redeclare `express-serve-static-core` from scratch instead of augmenting it. That would erase every property Express's own types declare on `Request`, `Response` and `Express`.
- `declare module 'express-serve-static-core'` with `interface Request`: the augmentation block.
- `Request.credentialAttemptFailed?: boolean`: records whether an OAuth callback failed by redirecting (a 302 carrying `?error=`). The callback controller sets it. A rate-limits module reads it in its credential budgets, so a failure that answers below 400 still spends them.

## Relationships
No graph neighbors. The file's comments mention, without any dependency edge:
- The callback controller, which sets `credentialAttemptFailed`.
- The rate-limits module, which reads it.
- Infrastructure's global `Request` augmentation, which this one merges onto the same interface.

## Notes
- Never remove `export {}`, and never add a top-level import in its place without keeping the file a module. Dropping it silently breaks Express typings program-wide.
- The property is optional, so readers must treat `undefined` as "not failed".
