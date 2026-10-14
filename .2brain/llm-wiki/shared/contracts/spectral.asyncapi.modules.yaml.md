---
source: shared/contracts/spectral.asyncapi.modules.yaml
sha256: 6529c3d6ec1fe8a0cfd160c6d54265b0ca5f3b26ad258c2c021fe3497212277d
generated_at: 2026-10-14T07:36:23.642523+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.asyncapi.modules.yaml

## Purpose

Spectral ruleset for linting **individual** AsyncAPI section files (`src/modules/<name>/asyncapi.yaml`, `shared/contracts/asyncapi.workers.yaml`) in isolation via `npm run lint:asyncapi:modules`. It selectively disables rules that check service-wide facts already declared once in the root contract, so each section can be validated as a standalone document without being penalised for not restating the full service identity.

## Key elements

- **`extends: [[spectral:asyncapi, recommended]]`** — base ruleset; all listed rules are exceptions to it.
- **`asyncapi-3-tags: off`** — the tag list is a service-level grouping declared in the root; a section need not repeat it.
- **`asyncapi-info-contact: off` / `asyncapi-info-license: off`** — a section's `info` block exists only to satisfy the AsyncAPI document schema; real identity lives in the root.
- **Deliberately NOT disabled:** `asyncapi-servers`, `asyncapi-channel-servers` — each section owns the server its channels bind to, so binding to an undeclared server is a genuine defect even in a section.
- **Override for `src/modules/webhooks/asyncapi.yaml`:** turns off `asyncapi-unused-components-schema` because the section references `WebhookHeaders` only after the bundler merges in the per-module webhook fragments; standalone the component looks unused.
- **`id` / `defaultContentType` are absent on purpose:** `spectral:asyncapi` has no rule for either; those checks come from `@asyncapi/parser`'s own ruleset at bundle-lint time, where they are properly scoped.

## Relationships

- **`shared/contracts/spectral.modules.yaml`** — the REST/OpenAPI twin; this file mirrors its purpose and structure for the AsyncAPI side of the contract.
- **`shared/contracts/asyncapi.root.yaml`** — declares the service-wide facts (tag list, `id`, `info` prose) that the disabled rules would otherwise demand each section restate.
- **`shared/contracts/asyncapi.workers.yaml`** — one of the section files this ruleset lints in isolation.

## Notes

- The choice of `spectral:asyncapi` (a Spectral plugin) over the `@asyncapi/parser`-bundled ruleset is deliberate: the parser's ruleset emits **ERROR**-level findings for missing `id`/`defaultContentType` that cannot be waived per section, whereas Spectral rules can be toggled off selectively.
- Because servers stay ON, `asyncapi.public.yaml` can drop the broker simply by omitting the relevant section — no separate server list needs to stay in sync.
- The webhooks override is the only `overrides:` entry; it is file-specific, not a general rule change.
