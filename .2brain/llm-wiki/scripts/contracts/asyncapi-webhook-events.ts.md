---
source: scripts/contracts/asyncapi-webhook-events.ts
generated_at: 2026-11-22T01:53:45.935272+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/asyncapi-webhook-events.ts

## Purpose
Discovers the webhook-event contract fragments that modules own (one `asyncapi.webhooks.yaml` per module that fires a public webhook) and exposes them to the contract bundler. Fragments merge only into the `webhooks` section, so a deployment without `webhooks` carries none of them, and one without `orders` carries no `order.*` channel. This keeps a module's contract leaving with the module, mirroring the OpenAPI side.

## Key elements
- `webhookEventFragments()`: returns the absolute paths of every module's webhook-event fragment, shop modules first, then alphabetical. It delegates to `sectionFragments('webhooks')`.
- `webhookEventNames()`: returns the name of every webhook event any module ships. It reads each fragment with `yaml`'s `parse` and takes the keys of its `channels` object (an empty list if `channels` is absent). Order is fragment order, then channel order within each fragment. Each event name appears once.
- `WEBHOOKS_SECTION` (private): the `'webhooks'` section name.

## Relationships
- `scripts/contracts/asyncapi-section-fragments.ts`: supplies `sectionFragments`, the generic discovery and merge logic. This file only supplies the section name.
- `scripts/contracts/openapi-bundle.ts`: the REST contract fills the subscription `eventTypes` enum from `webhookEventNames()` rather than keeping a copy. This is inferred from the doc comment, which says the REST contract uses it.
- `tests/unit/scripts/contracts/asyncapi-webhook-events.test.ts`: unit tests for this module.
- `tests/unit/scripts/mutation/ci/waves.test.ts`: related to this file through the dependency graph. The file shows no direct interaction.

## Notes
- Fragments are read synchronously with `readFileSync` and parsed with plain `yaml` `parse`, so fragments must not use custom YAML tags.
- Event names are not de-duplicated across fragments. The "each event name once" guarantee holds only if no two fragments declare the same channel key.
- Design rationale is referenced in the file's `@see` tag as `docs/build/contract-fragmentation.md#module-owned-webhook-events`; that path is not part of this repository's known files.
