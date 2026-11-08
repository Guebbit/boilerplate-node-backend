---
source: shared/rules/rate-limits.yaml
sha256: ac0e2a22b7afbdfbc1bb17554ae85a4e4c2c0fbdb7ae9883aeb892b6e767d246
generated_at: 2026-11-08T03:10:09.676068+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/rate-limits.yaml

## Purpose

Declares the kernel-wide rate-limit budgets (global browsing, API-key requests, image uploads) as structured data. It is the single source of truth from which `npm run regenerate` emits `src/infrastructure/http/middlewares/rate-limits.generated.ts`. The file itself is never read at runtime.

## Key elements

- **`rateLimits.global`** – Default budget for every request hitting the surface. Keyed by IP; a valid api-key request is refunded from this bucket. `onStoreError: pass` lets traffic through if the Redis store is down (browsing guard, not a credential guard).
- **`rateLimits.apiKey`** – Budget keyed on the credential (API key) rather than the client address, so partners behind a shared NAT or CDN each get their own allowance. Audited.
- **`rateLimits.uploads`** – Budget for image-upload routes. Sized lower (20) because the `worker.image.digest` pipeline is CPU-bound and a burst of well-formed uploads can saturate resources the global budget was not tuned for. Audited.
- **Per-entry fields** – `name`, `namespace` (camelCase key), `environmentVariable`, `defaultMax`, `windowMs` (`shared` → `NODE_RATE_LIMIT_WINDOW_MS`, or a literal ms value), `bounds` (human-readable rationale), `audited`, and optionally `onStoreError` (absent = `memory`).

## Relationships

- **`src/modules/account/module.yaml`** – Module-level rate limits live under `rateLimits:` in each module's `module.yaml` using the same field schema. The account module's own budgets are the closest neighbor; the kernel budgets here act as the outer envelope that a module's per-route limits sit inside.

## Notes

- This file is **data, not code**. Key-generation logic, success/skip semantics, and store-error fallbacks remain in `rate-limit.ts`. Editing this YAML does not change runtime behavior until `npm run regenerate` is run.
- `windowMs: shared` is a sentinel, not a number — it resolves to the `NODE_RATE_LIMIT_WINDOW_MS` environment variable at generation time.
- `onStoreError` is optional; when omitted the fallback store is `memory`. Only the `global` entry overrides this to `pass`.
- The `bounds` field is a free-text rationale, not a configuration value. It documents *why* a budget exists but is ignored by the generator.
