---
source: shared/rules/rate-limits.yaml
source_sha256: ac0e2a22b7afbdfbc1bb17554ae85a4e4c2c0fbdb7ae9883aeb892b6e767d246
context_sha256: f079a17f8c11631b2f9ef9b8f02eff87647c51e5b8bde040d27ae13af590af8f
generated_at: 2026-11-22T02:26:51.198636+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/rate-limits.yaml

## Purpose
Declares the kernel's rate-limit budgets as data: the browsing brake (`global`), the api-key brake (`apiKey`) and the upload brake (`uploads`). Modules declare their own budgets in their `module.yaml` under `rateLimits:` using the same fields.

## Key elements
Each entry is keyed by its `namespace` in camelCase and has these fields: `name`, `namespace`, `environmentVariable`, `defaultMax`, `windowMs`, `bounds` (a prose description of what the budget covers), `audited`, and optionally `onStoreError`.

- **`global`** ("Browsing (global)", namespace `global`): env `NODE_RATE_LIMIT_MAX`, default 100, not audited. It covers every request. A request carrying a valid api-key is refunded once it ends and counts against that key instead. A fake key does not earn the refund. It is the only budget with `onStoreError: pass`, so requests go through while the limits Redis is down.
- **`apiKey`** ("Api-key requests", namespace `api-key`): env `NODE_API_KEY_RATE_LIMIT_MAX`, default 120, audited. It is keyed on the credential rather than the address.
- **`uploads`** ("Image uploads", namespace `uploads`): env `NODE_UPLOAD_RATE_LIMIT_MAX`, default 20, audited. It covers routes that accept an image upload, because image processing (`worker.image.digest`) is CPU-bound.

## Relationships
- `shared/rules/metrics.yaml` and `src/modules/account/module.ts` are graph neighbors. The file content shows no direct interaction with either, so none is described here.

## Notes
- The file is not read at boot. `npm run regenerate` generates TypeScript from it, so edit this file and rerun that command rather than editing the generated output by hand.
- Key generators, what counts as a success and what is skipped stay in code, not in this file.
- `windowMs` is in milliseconds, or the literal `shared` for `NODE_RATE_LIMIT_WINDOW_MS`. All three entries use `shared`.
- If `onStoreError` is absent, it means `memory`.
