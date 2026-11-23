---
source: docs/.vitepress/theme/mermaid-options.ts
source_sha256: 6ea78438eecc9eda8516f8c574e08f3b9ec73e25a1f6ae31242425a5bb37f316
context_sha256: c092dd6e012d83ebd48033cd538a11d27eb45fbe9fa8f8d9d4fa614dabee53a1
generated_at: 2026-11-22T01:35:09.688579+00:00
model: claude-code:claude-sonnet-5-5
---

# docs/.vitepress/theme/mermaid-options.ts

## Purpose
Exports the shared Mermaid configuration used by every diagram on the documentation site. It centralizes layout settings and brand colors so all diagrams look consistent. `MermaidDiagram.vue` layers the theme name (light or dark) and the security level on top of these options.

## Key elements
- `mermaidOptions`: a plain config object, the file's only export. It contains:
  - `useMaxWidth: true` and `htmlLabels: true`.
  - `flowchart`: `nodeSpacing: 45`, `rankSpacing: 70`, `padding: 15`.
  - `themeVariables`: the color palette.
    - Primary: `primaryColor` `#f5f3ff`, `primaryBorderColor` `#7c3aed` (violet), `primaryTextColor` `#111827`.
    - Secondary: `secondaryColor` `#eff6ff`, `secondaryBorderColor` `#2563eb` (blue).
    - Tertiary: `tertiaryColor` `#ecfeff`, `tertiaryBorderColor` `#0891b2` (cyan).
    - Clusters and lines: `clusterBkg` `#f8fafc`, `clusterBorder` `#cbd5e1`, `lineColor` `#64748b`.

## Relationships
- `MermaidDiagram.vue` is the consumer. It adds the theme name and security level to `mermaidOptions`.

## Notes
- The options follow the Mermaid config schema: https://mermaid.js.org/config/schema-docs/config.html
- The `themeVariables` are fixed hex values. This file does not set a theme name or security level, so `MermaidDiagram.vue` supplies both.
