---
source: src/modules/invoicing/templates/documents/logo.svg
source_sha256: f0369036ee141a16df2a4c7452b363b71a1befb8252e6c1c5f6d4421c7f68e95
context_sha256: 358123b9abd2a2f3d4a47b6e9dad49bf1b1faf5bfd38c6d371ea20ddd0003a39
generated_at: 2026-11-22T05:37:10.606646+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/templates/documents/logo.svg

## Purpose
A static SVG logo asset (577×176 px, viewBox `0 0 577.347 175.894`) used by the invoicing module's document templates. It is a pure vector image with no scripts or external references.

## Key elements
- **Root `<svg>`**: declares the SVG and xlink namespaces, `version="1.1"`, `xml:space="preserve"`, and a fixed width and height with a matching `viewBox`.
- **Dark teal layer (`#00838f`)**: a group of glyph paths for the lettering plus a large path for the round emblem on the left. It appears to act as a shadow or offset layer.
- **Light cyan layer (`#00bcd4`)**: a second group of glyph paths, placed a few units up and to the left of the dark layer. This gives a two-tone, drop-shadow look. The visible part of the file ends partway through this layer.
- All shapes are plain `<path>` elements with inline `style="fill:..."`. There are no gradients, text elements, IDs or classes.

## Relationships
- `src/modules/invoicing/openapi.yaml` is the only listed neighbor. The SVG content has no reference to it, so any link is external to the file, such as the spec or a template pointing at this asset.

## Notes
- The text is converted to outlines, so the wordmark cannot be edited as text. Changing it means editing path data or replacing the whole file.
- Colors are hard-coded in inline styles rather than CSS classes or variables, so recoloring means editing each path.
- The file is minified onto a few lines and is large, with most of its size in path data. Avoid hand-editing it.
