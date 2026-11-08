---
source: shared/contracts/asyncapi.root.yaml
sha256: b4aeae2525ab7c67c5f4433701682403048020e9572882b7ba8525cc89ea82ae
generated_at: 2026-11-08T03:06:48.474538+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/asyncapi.root.yaml

## Purpose

Service-level preamble for the project's AsyncAPI contracts. It declares facts about the backend as a whole — protocol version, application identifier, human-readable `info` block, shared tags, and default content type — so that module-specific channel documents don't repeat them. It is the AsyncAPI counterpart to `openapi.root.yaml`.

## Key elements

- **`asyncapi: 3.0.0`** — pins the AsyncAPI specification version.
- **`id`** — application-level URN (`urn:boilerplate-node-backend:asyncapi:contracts`); appears in both the public and internal bundles because they describe the same backend.
- **`info`** — title, version (`0.1.0`, alpha per SemVer §4), contact, license (AGPL-3.0), a prose description, and a single tag (`implemented`).
- **`defaultContentType`** — `application/json`; the fallback media type for all channels unless they override it.

## Relationships

- **`shared/contracts/asyncapi.workers.yaml`** — the only sibling contract in this directory. It owns the `rabbitmqLocal` server declaration and any channel not assigned to a domain module. The bundler merges this root preamble with module sections and `asyncapi.workers.yaml` to emit the final `asyncapi.public.yaml`; this file deliberately excludes both channels and servers so the public bundle never advertises an internal broker.

## Notes

- **Not a standalone valid AsyncAPI document.** A conforming document requires a `channels` map, which this file intentionally omits. Lint and validation must run on the merged output, not on this file in isolation. (Module documents, by contrast, *are* valid on their own.)
- **`info.description` mentions "the channels below"** — there are none in this file. The text reads as if written for the bundled output; don't expect to find channels here.
- **Version field is informational.** The `0.1.0` value is ignored by the breaking-change check; it exists for parity with `openapi.root.yaml`.
