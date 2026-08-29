# shared/contracts/asyncapi.root.yaml

## Purpose

Service-level AsyncAPI preamble: it declares the `asyncapi` version, application `id`, `info` block, `defaultContentType`, and `tags` exactly once so that no module has to restate them. It is the AsyncAPI twin of `openapi.root.yaml`. It does **not** define channels or servers — those live with the modules that own the events. The bundler merges this preamble with the module/worker sections to produce a complete AsyncAPI document (e.g. `asyncapi.public.yaml`).

## Key elements

- **`asyncapi: 2.6.0`** — pins the AsyncAPI spec version for all merged sections.
- **`id`** (`urn:boilerplate-node-backend:asyncapi:contracts`) — application-level identifier carried by every bundle produced from this contract.
- **`info`** — title, version, contact, license (AGPL-3.0), and a short description. Declared once here; modules inherit it via the merge.
- **`defaultContentType`** — `application/json`, the content type assumed for any message that doesn't override it.
- **`tags`** — a single `implemented` tag whose description marks contracts already running in the backend runtime.

## Relationships

- **`shared/contracts/asyncapi.workers.yaml`** — the sibling section for domain-agnostic queue channels; also declares the `rabbitmqLocal` server. Merged alongside this file by the bundler.
- **`shared/contracts/openapi.root.yaml`** — the synchronous-HTTP counterpart; same "preamble only" role, same `id` namespace pattern.
- **`src/modules/observability/asyncapi.yaml`** — a module section that contributes channels and the `sseLocal` server; merged with this preamble to form a valid document.
- **`asyncapi.yaml`** (repo root) — the bundler output (or the entry that triggers the merge) that combines this preamble with all module/worker sections into a standalone AsyncAPI document.

## Notes

- **Not independently valid.** A standalone AsyncAPI document requires a `channels` key; this file has none. Module sections, by contrast, are valid on their own and are linted that way.
- **Servers travel with channels.** This file intentionally omits the `servers` section. A server (e.g. `rabbitmqLocal`, `sseLocal`) is only reachable through the channels bound to it, so it is declared wherever those channels live. This is what lets the bundler emit a public bundle that doesn't advertise brokers an external client cannot reach.
- **`id` is shared.** Both the public and internal bundles carry this same `id` because they describe the same backend, one of them partially.
