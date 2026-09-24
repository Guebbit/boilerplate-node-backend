---
source: shared/contracts/asyncapi.root.yaml
sha256: e55b3074b000cdf5cfa48d2f1e15dc2ea9fa460223edfbc96037f8c8c8a31bc6
generated_at: 2026-09-23T17:33:33.279010+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/asyncapi.root.yaml

## Purpose

Preamble fragment for the AsyncAPI contract bundle. It holds the service-level facts—`id`, `info` (title, version, contact, license, description), `tags`, and `defaultContentType`—that would otherwise be restated in every module document. It is the AsyncAPI twin of `openapi.root.yaml`. It is **not** a valid standalone AsyncAPI document (it has no `channels`); validity is achieved only after the bundler merges in the module and worker sections.

## Key elements

- **`asyncapi: 3.0.0`** — spec version; distinct from `info.version` (see Notes).
- **`id`** (`urn:boilerplate-node-backend:asyncapi:contracts`) — application-level identifier shared by every bundle this file contributes to.
- **`info`** — title, version (`2.0.0`), contact block, AGPL-3.0 license, and a free-form description of the contract's scope.
- **`tags`** — a single `implemented` tag marking contracts already live in the backend runtime.
- **`defaultContentType`** — `application/json`, applied to all channels unless overridden.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — direct twin; version bumps are coordinated between the two files.
- **`shared/contracts/asyncapi.workers.yaml`** — sibling section for queues no domain module owns; the bundler merges it alongside this file. Declares its own `rabbitmqLocal` server.
- **`src/modules/observability/asyncapi.yaml`** — representative module section that the bundler merges in; carries its own `sseLocal` server and channels.
- **`asyncapi.public.yaml`** — the published bundle produced by the bundler from this file plus the public-facing module sections (workers section excluded, so no internal broker is advertised).
- **`shared/contracts/spectral.asyncapi.modules.yaml`** — Spectral ruleset that lints *module* documents as standalone AsyncAPI files; this root file is not linted by it because it is not independently valid.
- **`CLAUDE.md`** — repository-level AI instructions that reference the contract layout conventions this file establishes.

## Notes

- **Not a valid document on its own.** A standalone AsyncAPI doc requires `channels`; this file has none until the bundler composes the final artifact. Module documents, by contrast, *are* valid standalone and are linted as such.
- **`asyncapi` spec version ≠ `info.version`.** The breaking-change gate (`check:asyncapi-breaking`) compares the `asyncapi:` field (currently `3.0.0` everywhere). The `info.version` bump to `2.0.0` is purely human-readable documentation of the Standard Webhooks envelope break; it does not suppress the gate.
- **Servers are deliberately absent.** A server is only reachable through its bound channels, so each server lives in whichever section declares those channels (e.g. `sseLocal` in the observability module, `rabbitmqLocal` in the workers file). This is what allows the public bundle to omit internal brokers.
- **Bumping `info.version`** should be done in lockstep with the corresponding change in `openapi.root.yaml`'s version.
