---
source: shared/contracts/asyncapi.root.yaml
source_sha256: b4aeae2525ab7c67c5f4433701682403048020e9572882b7ba8525cc89ea82ae
context_sha256: 00f3f042cece2b4f893ef1113df9ccef3e81cba9bc23d646fbfe2ce0fcccf116
generated_at: 2026-11-22T02:22:49.621247+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/contracts/asyncapi.root.yaml

## Purpose
The preamble of the service's AsyncAPI 3.0.0 contract. It declares facts about the service itself (version, application `id`, `info` prose, tags, default content type) once, so domain modules don't restate them. It is the async twin of `openapi.root.yaml`.

## Key elements
- `asyncapi: 3.0.0` — spec version.
- `id: 'urn:boilerplate-node-backend:asyncapi:contracts'` — the application identifier; both the full and public bundles carry it, since they describe one backend (one partially).
- `info` — title ("Boilerplate Node Backend Async Contracts"), version `0.1.0` (alpha, matching `openapi.root.yaml` and the module fragments), contact, AGPL-3.0 license, and a description of the real-time/event-driven flows.
- `tags` — a single `implemented` tag: contracts already implemented in the backend runtime.
- `defaultContentType: application/json`.

## Relationships
- `asyncapi.workers.yaml` (sibling) — holds the channels for queues no domain owns, plus the `rabbitmqLocal` server.
- `asyncapi.domain-events.yaml` — a sibling contract file; per the header, channels belong to the owners of the events, not this root. The root file itself doesn't reference it.
- `spectral.asyncapi.modules.yaml` — lint ruleset for the module documents. The header says modules are valid standalone and linted that way, whereas this root is not.
- A bundler merges the root with the module and worker sections to produce the full bundle and the public bundle.

## Notes
- Deliberately has no `channels` and no `servers`, so it is **not a valid standalone AsyncAPI document**. It becomes valid only after the bundler merges the sections in.
- Servers live with the channels bound to them. This lets the public bundle omit brokers that API clients can't reach.
- Module fragments own their channels; the observability module declares the `sseLocal` server.
- The breaking-change check ignores `info.version`.
