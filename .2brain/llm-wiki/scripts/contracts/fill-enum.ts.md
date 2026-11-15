---
source: scripts/contracts/fill-enum.ts
sha256: ffd4af8e1502c644b032a5715be0fa1eca762650c58a241bb66c7e459f2b7657
generated_at: 2026-11-14T17:24:22.524986+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/fill-enum.ts

## Purpose

Post-bundle step that replaces `x-enum-from` placeholder markers in OpenAPI contract fragments with concrete enum values sourced from elsewhere (e.g., webhook event names scattered across modules' `asyncapi.webhooks.yaml`). This avoids copy-paste drift: a module can declare "my enum comes from the *webhook-events* source" without hard-coding values that would go stale when another module adds one.

## Key elements

- **`EnumSources`** (exported type) — `Readonly<Record<string, readonly string[]>>`; the map from source name to its list of allowed values, injected by the bundler at runtime.
- **`withFilledEnums`** (exported function) — Entry point. Walks the bundled `OpenApiDocument` depth-first, resolves every placeholder in place, and deletes the `x-enum-from` / `x-enum-also` keys so they don't appear in the published contract.
- **`enumFor`** (internal) — Resolves the final value list for one placeholder: `[...written-enum?, ...source-values?, ...x-enum-also?]`. Enforces that the source is known (or absent only when the name is the schema's own component name, supporting `x-extends`), that the list is non-empty unless a written enum provides a fallback, and that no value appears twice.
- **`fillIn`** (internal) — Recursive walker over any parsed-YAML node; identifies placeholders via `'x-enum-from' in value`, delegates to `enumFor`, then recurses into children.
- **`isOwnName`** (internal) — Returns true when a string equals the last path segment of a `#/components/schemas/<name>` JSON pointer, distinguishing a whole-component self-reference from an incidental name match on a nested property.
- **`isStringList`** (internal) — Type guard used to validate `enum`, `x-enum-also`, and source lists.

## Relationships

- **`./openapi-document`** — Imports the `OpenApiDocument` type; this file operates on that structure without redefining it.
- **`./openapi-bundle`** — The caller. The bundler assembles the `EnumSources` object (e.g., collecting channel names from every module's webhooks) and passes it to `withFilledEnums` as a post-bundle step alongside other transforms.
- **`tests/unit/scripts/contracts/fill-enum.test.ts`** — Unit tests exercising placeholder resolution, append semantics, error paths (unknown source, empty source, duplicate values, malformed lists), and the `isOwnName` edge case.

## Notes

- **Mutates in place.** `withFilledEnums` has a `void` return type and rewrites `node.enum` directly on the document; callers must not treat the document as immutable after the call.
- **Append, not replace.** When a hand-written `enum` coexists with `x-enum-from`, the marker's source values are *appended* after the written ones. This is the mechanism by which a module extends another module's open enum via `x-extends`; a source nobody supplies then appends nothing.
- **`isOwnName` escape hatch.** An unknown source name is tolerated *only* when it exactly matches the component schema's own name at the current JSON pointer. This lets a schema self-reference as its own source (no-op when no extender supplies it) without a typo passing silently on a nested property.
- **No knowledge of specific sources.** The file is fully generic; adding a new source means adding one key to the object the bundler passes in, not touching this module.
- **Depth-first, order-insensitive.** The walker visits children after handling the current node, so a parent's enum value does not affect a child's resolution.
