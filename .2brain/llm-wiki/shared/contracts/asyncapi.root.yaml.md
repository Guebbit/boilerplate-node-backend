---
source: shared/contracts/asyncapi.root.yaml
sha256: d80fcdff44dc802a5f6ce7cd57c6d2ed114780ae378810fa4ee249cbe5b482b6
generated_at: 2026-10-14T07:35:17.687770+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/asyncapi.root.yaml

## Purpose

The preamble section of the project's AsyncAPI contract. It holds the service-level facts that every module fragment would otherwise restate — version, identity, `info` prose, tag list, and default content type. It is the AsyncAPI twin of `openapi.root.yaml` and is merged by the bundler with module fragments to produce a complete AsyncAPI document.

## Key elements

- **`asyncapi: 3.0.0`** — protocol version pin.
- **`id`** — application-level identifier (`urn:boilerplate-node-backend:asyncapi:contracts`), shared by both public and full bundles because they describe one backend.
- **`info.title` / `info.version` / `info.contact` / `info.license` / `info.description`** — standard AsyncAPI metadata; version is `0.1.0` (alpha) and is ignored by `check:asyncapi-breaking`.
- **`info.tags`** — a single `implemented` tag that module fragments reference.
- **`defaultContentType`** — `application/json`, inherited by all channels unless overridden.

## Relationships

- **`shared/contracts/asyncapi.workers.yaml`** — sibling section that carries channels for queues no domain module owns, plus the `rabbitmqLocal` server. The bundler merges it with this file.
- **`src/modules/observability/asyncapi.yaml`** — a module fragment that owns its own channels and the `sseLocal` server. The bundler merges it in; this file does not reference it directly.
- **`asyncapi.public.yaml`** — the bundler output that combines this preamble with the public-facing channel sections, deliberately excluding internal broker servers.
- **`shared/contracts/openapi.root.yaml`** — structural twin; mirrors the same preamble role for the OpenAPI side of the contract.
- **`shared/contracts/spectral.asyncapi.modules.yaml`** — Spectral lint rules applied to the module fragments (not to this file, which is not a standalone valid AsyncAPI document).

## Notes

- This file is **not** a valid standalone AsyncAPI document — it has no `channels`. A valid document requires at least one. The bundler must merge module/worker sections before the result is consumable.
- Servers are intentionally absent here. In AsyncAPI a server is only reachable through the channels bound to it, so each server travels with its channels in the owning module or in `asyncapi.workers.yaml`.
- Because it is not standalone, it is **not** linted as a complete AsyncAPI document the way individual module fragments are.
- The `id` is an application identifier (not a document-specific one), so both the full and public bundles carry the same value.
