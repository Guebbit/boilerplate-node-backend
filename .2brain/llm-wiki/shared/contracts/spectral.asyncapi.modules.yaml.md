---
source: shared/contracts/spectral.asyncapi.modules.yaml
sha256: 6529c3d6ec1fe8a0cfd160c6d54265b0ca5f3b26ad258c2c021fe3497212277d
generated_at: 2026-11-08T03:07:58.814795+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.asyncapi.modules.yaml

## Purpose

Spectral ruleset that lets each AsyncAPI section (module) be linted as a standalone document via `npm run lint:asyncapi:modules`. It extends the `spectral:asyncapi` recommended ruleset with targeted `off` overrides for rules that assert service-wide facts (tag list, info metadata) which individual sections cannot and should not restate, while keeping rules that a section *can* answer (server declarations, channel-to-server bindings) active.

## Key elements

- **`extends: [[spectral:asyncapi, recommended]]`** — base ruleset; everything starts enabled.
- **`asyncapi-3-tags: off`** — the tag list is declared once in `shared/contracts/asyncapi.root.yaml`; sections are not expected to carry it.
- **`asyncapi-info-contact: off` / `asyncapi-info-license: off`** — each section's `info` block exists only to make the file a syntactically valid document; the real metadata lives at the deployment/root level.
- **`asyncapi-servers` / `asyncapi-channel-servers`** — deliberately *not* turned off. Each section declares the server its channels bind to (e.g. `sseLocal`, `rabbitmqLocal`), so a channel referencing an undeclared server is a genuine defect in that section.
- **`overrides` for `src/modules/webhooks/asyncapi.yaml`** — disables `asyncapi-unused-components-schema` because webhook event schemas are defined in per-module fragments and merged in by the bundler; the section alone legitimately "looks unused."

## Relationships

- **`shared/contracts/spectral.asyncapi.names.yaml`** — sibling Spectral ruleset in the same directory; together they form the per-section AsyncAPI linting pair (names + structural rules), mirroring the role `spectral.modules.yaml` plays for OpenAPI sections.

## Notes

- `id` and `defaultContentType` are **not** turned off here because `spectral:asyncapi` has no rule for either. Warnings for those come from `@asyncapi/parser`'s own ruleset, which runs against the assembled bundles (`asyncapi.yaml`, `asyncapi.public.yaml`) where they belong.
- The design invariant: turning off a rule should only happen when the rule asserts a fact that is *inherently service-wide*. Any rule a single section can satisfy (or violate) on its own stays on.
- Dropping a server from the contract is a one-section edit (remove the section, the server declaration disappears with it); there is no second server list to keep in sync.
