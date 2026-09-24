---
source: shared/contracts/spectral.asyncapi.modules.yaml
sha256: f05544535cbde86a5a91bbb5791fd3ca3d2105cec96187d35b5ea891c5709767
generated_at: 2026-09-23T17:34:15.422825+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.asyncapi.modules.yaml

## Purpose

A Spectral ruleset that lets individual AsyncAPI module sections (e.g. `src/modules/<name>/asyncapi.yaml`, `asyncapi.workers.yaml`) be linted in isolation. It relaxes the rules that demand service-wide fields—tags, contact, licence—which are declared once in the root contract rather than restated per section. Invoked via `npm run lint:asyncapi:modules`.

## Key elements

- **`extends: [[spectral:asyncapi, recommended]]`** — inherits the full recommended AsyncAPI rule set as a baseline.
- **`asyncapi-3-tags: off`** — the tag list is a service-level fact owned by the root; a section need not repeat it.
- **`asyncapi-info-contact: off`** — the `info.contact` block in a section exists only to satisfy document validity; the real contact lives in the deployment root.
- **`asyncapi-info-license: off`** — same rationale for licence metadata.
- **Server rules (`asyncapi-servers`, `asyncapi-channel-servers`) are deliberately NOT disabled.** Each section declares the server its channels bind to, so a channel referencing an undeclared server is a real defect even in isolation.

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — the single source of the service-wide facts (tags, `id`, `defaultContentType`, `info` prose) that this ruleset assumes are absent from a section. The bundle lint still enforces their presence against the assembled root.
- **`shared/contracts/asyncapi.workers.yaml`** — one of the complete AsyncAPI documents that `npm run lint:asyncapi:modules` lints against this ruleset.
- **`shared/contracts/spectral.modules.yaml`** — the synchronous (OpenAPI) counterpart; this file is explicitly described as "the async twin" of that ruleset, created for the same reason.

## Notes

- The ruleset uses `spectral:asyncapi` rather than `@asyncapi/parser`'s built-in ruleset because the parser reports a missing root-level `id` or `defaultContentType` as an **ERROR** that cannot be waived per-section. Spectral rules are all waivable, which is what makes per-section linting possible.
- The full bundle lint (`npm run lint:asyncapi`) still runs the parser's own ruleset against `asyncapi.yaml` and `asyncapi.public.yaml`, where an undeclared content type or missing root field is a genuine defect. This file only governs the per-section pass.
- Adding a section (or dropping one, as in `asyncapi.public.yaml`) never requires touching a central server list—servers travel with their section, which is the design property the comments emphasize.
