---
source: scripts/contracts/asyncapi-section-fragments.ts
source_sha256: 76b0797a75e404ec65a628f5f636cd577a121975357a44704b888ce095cdd7d3
context_sha256: 49da5ee14f202bef743ed3be4f9a9d928c8228309474901ba69f1491c3b101c3
generated_at: 2026-11-22T01:53:34.211007+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/asyncapi-section-fragments.ts

## Purpose
Discovers and merges the AsyncAPI fragments that modules ship for sections they do not own: webhook events (`webhooks`), notice payloads added to `notifications`, and backend-only `domain-events`. Each `src/modules/<m>/asyncapi.<section>.yaml` merges into that section's document only. It lives in its own file so the bundler meets it through a single call (`withSectionFragments`) and the discovery rule stays testable.

## Key elements
- `sectionFragments(section, modulesRoot = MODULES_ROOT)`: lists the absolute paths of every module's `asyncapi.<section>.yaml`. For `webhooks` it orders by `WEBHOOK_ORDER` (`orders`, `delivery`, `payments`, `returns`), then alphabetically. Other sections are ordered alphabetically.
- `localiseOpenApiReferences(fragment, openapiFile)`: edits a fragment's parsed document in place. It finds `$ref`s into `./openapi.yaml` or `../<module>/openapi.yaml`, copies each referenced REST schema into the fragment's `components.schemas` just before the first schema that uses it, and rewrites the ref to `#/components/schemas/<Name>`. Each copy is stamped with `x-openapi-schema: <Name>`. It throws if:
  - the schema is missing or holds a `$ref`;
  - the schema is an open enum (`x-enum-from`);
  - the fragment already declares that name itself.
- `appendExtensions` (internal): reads the fragment's `x-extends: { <Schema>: [<Name>, ...] }` and appends a `$ref` for each name to that schema's `oneOf` in the section document. It throws if:
  - the map is malformed;
  - the target has no `oneOf`;
  - a name isn't declared in the fragment;
  - the union already holds the name.
- `orderByReference` (internal): reorders `components.schemas` so each schema follows the schemas it references. The Zod emitter declares in order, and cycles are cut off. A schema already after its references keeps its place, so a section nobody extends is left as written.
- Helpers `localiseReferencesIn`, `localReferencesIn` and `restSchemaOf` handle ref rewriting, local ref collection and schema validation.
- The file's last documented function folds every module's fragment for a section into that section's document, taking `section`, `document`, `merge` and `modulesRoot`. The bundler's `merge` refuses a key that two owners both declare. The rest of that function is not shown here.

## Relationships
- `./fragments`: supplies `readOpenApiFragment` and the `OpenApiFragment` type, used to read the REST contract files that fragments reference.
- `./section-order`: `orderSections` applies the preferred order and alphabetical tail.
- `./extends-map`: `parseExtendsMap` and `requireDeclared` parse and validate `x-extends`, the same reader the OpenAPI side uses.
- `../modules-on-disk`: provides `MODULES_ROOT` and `modulesWith` for discovering which modules have a given fragment file.
- `./asyncapi-bundles`: the bundler that calls `withSectionFragments` and supplies the `merge` function.
- `./asyncapi-webhook-events`: webhook-event names built on this discovery live there.
- Tests: `asyncapi-section-fragments.test.ts` covers this file directly. `analytics-browser-events.test.ts` and `paired-frontend-path.test.ts` are graph neighbors, but their exact interaction isn't visible here.

## Notes
- Open enums are refused on purpose. A copy would be the owner's raw file, without the extenders' values.
- Copied schemas carry `x-openapi-schema` so the type generators import the REST type instead of declaring a second one.
- A REST contract file is read only when a fragment references it. `openapiFile` need not exist otherwise.
- Copies are inserted before their first user because of the Zod emitter's declare-in-order behavior.
- `WEBHOOK_ORDER` is a narrative preference, not a registry.
