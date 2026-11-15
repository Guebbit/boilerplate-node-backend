---
source: shared/rules/outbox.yaml
sha256: e32b414be5c2ff216ab41e9bb6e7f1ef33e7f668a4739269c261015b7bab28a3
generated_at: 2026-11-14T17:46:31.586321+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/outbox.yaml

## Purpose

Source-of-truth YAML that defines the transactional outbox's retry-policy defaults. It is **not** read at runtime; instead, `npm run regenerate` transpiles it into `src/kernel/outbox.generated.ts`, which the PHP twin also copies. This keeps the values in one place while letting both the Node and PHP runtimes consume the same constants.

## Key elements

- **`retentionDays` (7)** – TTL on the `publishedAt` index; how long a published outbox row is kept before expiry.
- **`maxAttempts` (10)** – Failed dispatch count after which a row is parked as `dead`.
- **`leaseSeconds` (60)** – Duration of a relay's claim on a row; must exceed a single dispatch's worst-case duration to prevent duplicates.
- **`backoffBaseMs` (5000)** – Wait after the first failure; doubles on each subsequent retry.
- **`backoffCapMs` (3600000)** – Hard ceiling on backoff (1 hour) regardless of attempt count.

Each of `retentionDays`, `maxAttempts`, and `leaseSeconds` can be overridden at runtime via `NODE_OUTBOX_*` environment variables. The two backoff values are fixed.

## Relationships

- **`shared/rules/jobs.yaml`** and **`shared/rules/metrics.yaml`** – Sibling rule files in the same `shared/rules/` directory. All three follow the same convention: human-edited YAML whose values are consumed by the `npm run regenerate` pipeline and shared across runtimes.

## Notes

- The file is **data, not configuration loaded at boot**. Editing it has no effect until `npm run regenerate` is run.
- Units are embedded in the key name (`Days`, `Seconds`, `Ms`); there is no separate unit field.
- `leaseSeconds` must stay greater than the longest possible single dispatch, or a slow dispatch will be picked up by a second relay and duplicated.
- The backoff pair (`backoffBaseMs` / `backoffCapMs`) is intentionally **not** env-overridable, unlike the other three keys.
