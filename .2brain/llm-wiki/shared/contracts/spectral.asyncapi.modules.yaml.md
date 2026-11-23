---
source: shared/contracts/spectral.asyncapi.modules.yaml
generated_at: 2026-11-22T02:24:10.650186+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/contracts/spectral.asyncapi.modules.yaml

## Purpose
Spectral ruleset used by `npm run lint:asyncapi:modules` to lint each section of the async contract on its own. Sections (`src/modules/<name>/asyncapi.yaml` and `shared/contracts/asyncapi.workers.yaml`) are complete AsyncAPI documents but not complete APIs, so rules that demand service-wide facts are turned off here. It is the async counterpart of `spectral.modules.yaml`.

## Key elements
- `extends: [[spectral:asyncapi, recommended]]`: uses Spectral's built-in AsyncAPI ruleset, not the parser's own ruleset. The parser's ruleset would raise un-waivable errors for a missing `id` or `defaultContentType`, which are root-level facts.
- `asyncapi-3-tags: off`: the tag list is service-wide and declared once in the root.
- `asyncapi-info-contact: off` and `asyncapi-info-license: off`: a section's `info` block only makes the file a valid document. Real contact and licence belong to the deployment.
- Override for `src/modules/webhooks/asyncapi.yaml` (written in the file as `../../src/modules/webhooks/asyncapi.yaml`): `asyncapi-unused-components-schema: off`. The section declares the shared `WebhookHeaders`, while the events live in the modules' `asyncapi.webhooks.yaml` fragments merged in by the bundler.
- Override for `asyncapi.domain-events.yaml`: `asyncapi-servers: off`. Domain events bind to no server, because they go through the outbox or are emitted in-process rather than sent on a broker.

## Relationships
- `asyncapi.root.yaml`: holds the service-wide facts (tags, id, `info` prose) that this ruleset stops sections from having to restate.
- `asyncapi.workers.yaml`: one of the sections linted with this ruleset. It declares its own `rabbitmqLocal` server beside the queues.
- `asyncapi.domain-events.yaml`: linted with this ruleset, and the only file that gets the `asyncapi-servers` exemption.

## Notes
- The rules turned off here stay on for the assembled bundles, which `npm run lint:asyncapi` lints with the parser's own ruleset.
- Server rules (`asyncapi-servers`, `asyncapi-channel-servers`) are intentionally left ON. Each section declares the server its channels bind to (for example `sseLocal` in the observability module). This keeps a section lintable as a whole document and lets a public bundle drop the broker by dropping the section.
- `id` and `defaultContentType` are not named in the rules because `spectral:asyncapi` has no rule for them. The warnings come from the parser's ruleset on the bundles.
- The webhooks override path is `../../src/modules/...` and the domain-events override is a bare filename, so both are relative to this file's location.
