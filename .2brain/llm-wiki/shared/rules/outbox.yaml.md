---
source: shared/rules/outbox.yaml
source_sha256: e32b414be5c2ff216ab41e9bb6e7f1ef33e7f668a4739269c261015b7bab28a3
context_sha256: 37cfd0b983e8d2785c153fd6c6f1d57b689aab3daafb6770c9cc5361864aa5c6
generated_at: 2026-11-22T02:26:40.857281+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/outbox.yaml

## Purpose
Defines the default retry and retention policy for the transactional outbox as plain data. It is not read at boot: `npm run regenerate` generates `src/kernel/outbox.ts` from it, and the PHP twin copies the values. Units are encoded in the key names.

## Key elements
All keys live under the top-level `outbox` map:
- `retentionDays: 7`: days a published row is kept before the TTL index on `publishedAt` expires it.
- `maxAttempts: 10`: failed dispatches before a row is parked as `dead`.
- `leaseSeconds: 60`: how long a relay's claim on a row lasts. It must outlast one dispatch, or a slow dispatch gets duplicated.
- `backoffBaseMs: 5000`: wait after the first failure. It doubles with each further failure.
- `backoffCapMs: 3600000`: upper bound on the wait (one hour), regardless of attempt count.

## Relationships
`shared/rules/jobs.yaml` and `shared/rules/metrics.yaml` are neighbors in the same `shared/rules/` directory. The file content shows no explicit references to either, so no interaction beyond that shared location is documented here.

## Notes
- `retentionDays`, `maxAttempts` and `leaseSeconds` can each be overridden by a `NODE_OUTBOX_*` environment variable. The backoff pair is fixed and has no override.
- Edit this YAML and re-run `npm run regenerate` rather than editing the generated TypeScript.
- Keep `leaseSeconds` longer than the longest expected single dispatch.
