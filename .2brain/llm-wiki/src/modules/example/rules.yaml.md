---
source: src/modules/example/rules.yaml
source_sha256: 2a50cb882629886d863a7630fefa0a9e6d9f26dbd481746839582e88de68e11b
context_sha256: 2e974d811fd4f1023b2e5d1ec9211bd8c67129d75d1ca0ca03ca4e9457392b94
generated_at: 2026-11-22T05:11:27.041327+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/rules.yaml

## Purpose
Declares the example module's audit action names and analytics event names, each with a description. It is not read at boot. `npm run regenerate` produces a generated TypeScript file from it, so the strings can type the app-wide `AuditActionMap` / `AnalyticsEventMap` unions. A list loaded at runtime would widen those types to `string`.

## Key elements
- `audit`: a list of `value` / `description` entries:
  - `example.created`: an example was created.
  - `example.updated`: an example's fields were edited.
  - `example.status_changed`: an example moved between statuses.
  - `example.deleted`: an example was deleted.
  - `example.cover_changed`: an example's cover image was set or removed.
- `analytics`: a list of `value` / `description` entries:
  - `example_published`: an example was published.

## Relationships
- `src/modules/example/openapi.yaml` sits next to this file in the same module. The content shown contains no reference to it and no visible interaction.

## Notes
- The generated constant's key is derived from `value`: uppercase, with `.` replaced by `_`. For example, `example.status_changed` becomes `EXAMPLE_STATUS_CHANGED`.
- Edit this YAML and re-run `npm run regenerate`. Don't edit the generated output by hand.
- Audit values use dotted names (`example.created`). The analytics value uses an underscore name (`example_published`).
