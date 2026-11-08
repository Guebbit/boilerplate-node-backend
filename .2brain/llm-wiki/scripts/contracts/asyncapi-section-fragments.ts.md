---
source: scripts/contracts/asyncapi-section-fragments.ts
sha256: ee075e14194c12e8938145b375ef098d1d981f8e7d3d9326648722aca904b925
generated_at: 2026-11-08T02:38:52.089499+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-section-fragments.ts

## Purpose

Discovers, localises, and merges per-module AsyncAPI YAML fragments (e.g. `asyncapi.webhooks.yaml`, `asyncapi.notifications.yaml`) into a single section document. Each module contributes schemas and channels it does not own; this file makes the merged bundle self-contained by inlining referenced REST schemas and appending `x-extends` names to the owner's `oneOf` unions, all while preserving declaration order for the downstream Zod emitter.

## Key elements

- **`sectionFragments(section, modulesRoot?)`** — Returns absolute paths to every module's fragment file for the given section, ordered by `WEBHOOK_ORDER` (orders, delivery, payments, returns) then alphabetically for webhooks; alphabetical only for other sections.
- **`localiseOpenApiReferences(fragment, openapiFile)`** — Finds `$ref`s into `./openapi.yaml` or `../<sibling>/openapi.yaml`, copies the target schema into the fragment's `components.schemas` (stamped with `x-openapi-schema`), and rewrites the ref to a local `#/components/schemas/<name>`. Refuses open enums (`x-enum-from`) and non-self-contained schemas.
- **`withSectionFragments(section, document, merge, modulesRoot?)`** — The single entry point the bundler calls. Iterates over `sectionFragments`, localises refs, merges each fragment into the section document via the supplied `merge` callback (which rejects duplicate keys), appends `x-extends` entries, and re-orders schemas so referenced ones precede their referrers.
- **`appendExtensions(document, fragment, label)`** *(internal)* — Reads a fragment's `x-extends` map, validates the target is a `oneOf` seq, and appends a `$ref` node for each declared name.
- **`orderByReference(document)`** *(internal)* — Re-orders `components.schemas` so each schema appears after the schemas it `$ref`s; guards against cycles.
- **`localiseReferencesIn(node)`** *(internal)* — Walks a single schema node, rewrites matching OpenAPI refs to local ones, and returns the list of referenced names.
- **`restSchemaOf(rest, file, name)`** *(internal)* — Extracts a schema from a parsed OpenAPI fragment, throwing on open enums or schemas that themselves contain `$ref`s.

## Relationships

- **`scripts/contracts/fragments.ts`** — Provides `readOpenApiFragment` and the `OpenApiFragment` type used to read sibling REST contracts.
- **`scripts/contracts/section-order.ts`** — Provides `orderSections`, which applies `WEBHOOK_ORDER` (or no preference) before falling back to alphabetical.
- **`scripts/contracts/extends-map.ts`** — Provides `parseExtendsMap` and `requireDeclared`, the shared reader for the `x-extends` mechanism (same code path as the OpenAPI side).
- **`scripts/modules-on-disk.ts`** — Provides `MODULES_ROOT` (default `src/modules`) and `modulesWith`, which lists module folders containing a given file.
- **`scripts/contracts/asyncapi-bundles.ts`** — The bundler that calls `withSectionFragments` as its merge step; supplies the section document and the `merge` callback that enforces key-uniqueness across owners.
- **`scripts/contracts/asyncapi-webhook-events.ts`** — Builds webhook event name resolution on top of the fragments this file merges.
- **`src/modules/users/asyncapi.webhooks.yaml`** — A concrete fragment that this logic discovers and merges.
- **`tests/unit/scripts/contracts/asyncapi-section-fragments.test.ts`** — Unit tests exercising discovery, localisation, extension-appending, and ordering.

## Notes

- **Declaration order matters.** The Zod emitter declares schemas in document order. Both `localiseOpenApiReferences` (inserts copies *before* the first user) and `orderByReference` (moves referenced schemas ahead of their referrers) exist to preserve that invariant.
- **Open enums are hard-refused.** A schema marked `x-enum-from` cannot be copied because the copy would lack the values that extending modules add; `restSchemaOf` throws rather than silently producing an incomplete enum.
- **`x-openapi-schema` marker** is stamped on every inlined copy so downstream type generators can import the original type rather than re-declaring it.
- **Sibling refs** (`../<module>/openapi.yaml`) are resolved relative to the fragment's own module folder, enabling a module that extends another's payload to reference the owner's schema.
- **`WEBHOOK_ORDER` is a preference list, not a registry.** Modules not listed fall through to alphabetical order.
- The file is kept separate from `asyncapi-bundles.ts` so the bundler meets all fragment logic at one call (`withSectionFragments`) and the discovery/merge rules remain independently testable.
