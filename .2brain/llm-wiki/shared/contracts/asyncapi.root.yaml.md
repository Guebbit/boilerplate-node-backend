---
source: shared/contracts/asyncapi.root.yaml
sha256: b4aeae2525ab7c67c5f4433701682403048020e9572882b7ba8525cc89ea82ae
generated_at: 2026-10-29T01:47:00.442026+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/asyncapi.root.yaml

## Purpose

The service-level preamble for the AsyncAPI 3.0.0 contract. It declares facts about the backend as a whole — version, identity, contact, license, tags, and default content type — so that no module fragment has to restate them. It is the async twin of `openapi.root.yaml` and is merged with module sections by the bundler to produce the final AsyncAPI documents.

## Key elements

- **`asyncapi: 3.0.0`** — protocol version.
- **`id`** — application-level URN (`urn:boilerplate-node-backend:asyncapi:contracts`); carried by every bundle produced from this project.
- **`info`** — title, SemVer `0.1.0` (initial development), contact, AGPL-3.0 license, and a short description.
- **`tags`** — a single `implemented` tag marking contracts already present in the runtime.
- **`defaultContentType: application/json`** — fallback media type for all message payloads unless a channel overrides it.
- **No `channels` key** — channels live in module files (`src/modules/<name>/asyncapi.yaml`) or in `asyncapi.workers.yaml`; this file intentionally omits them.
- **No `servers` key** — each server travels with the channels that bind to it (e.g. `sseLocal` in the observability module, `rabbitmqLocal` in `asyncapi.workers.yaml`).

## Relationships

- **`openapi.root.yaml`** — synchronous counterpart; same `id` namespace pattern, same `0.1.0` version, same structural role (service preamble vs. domain fragments).
- **`asyncapi.workers.yaml`** — a sibling section in the same directory; holds the domain-less queue channels and the `rabbitmqLocal` server. Merged with this file and module sections by the bundler.
- **`src/modules/observability/asyncapi.yaml`** — representative module fragment that declares the `sseLocal` server and its channels; one of the sections the bundler merges into the final document.
- **`asyncapi.public.yaml`** — bundler output: the subset of merged sections exposed to external API clients (excludes broker-only servers like `rabbitmqLocal`).
- **`spectral.asyncapi.modules.yaml`** — Spectral rule set that lints module fragments (and, by exclusion, the shape this file leaves open).

## Notes

- This file is **not** a valid standalone AsyncAPI document; a conforming document requires `channels`, which only exist after the bundler merges module sections. Module files, by contrast, *are* valid on their own and are linted as such.
- The `version` field (`0.1.0`) is informational only — the breaking-change tooling ignores it.
- Servers are deliberately absent here so the public bundle does not advertise brokers a client cannot reach.
