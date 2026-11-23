---
source: scripts/contracts/extends-map.ts
source_sha256: 3e7bd60b6ee5e3bfb5738dd30cd3772f3e4951cf5da75783a96bfb2c2dd49a76
context_sha256: 20a020968aa79ab9a81d799279f5b5b4dabbca5b07e6340c65dea2ff4c7a0d80
generated_at: 2026-11-22T01:55:32.040501+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/extends-map.ts

## Purpose
Reads a fragment's `x-extends` value (`{ <Schema>: [<value or schema name>, ...] }`) in one place, so OpenAPI and AsyncAPI fragments treat a malformed map, a repeated name, or an undeclared variant identically: refused with a thrown error rather than dropped on one side and thrown on the other.

## Key elements
- `parseExtendsMap(declared, where)`: validates an unknown `x-extends` value and returns a `Record<string, string[]>`. Throws if the value is not a plain object, any entry is not a list of strings, a list is empty, or a list contains duplicates. `where` is the fragment label used as the error-message prefix (the doc example is `[openapi]` followed by the fragment's path).
- `requireDeclared(names, declared, where)`: throws on the first name in `names` that is not an own key of `declared` (the fragment's own schemas), with the message "variant X is not declared in the fragment's components."
- `isStringList` (private): type guard for `string[]`.

## Relationships
- Uses `isPlainObject` from `src/infrastructure/object-guards.ts` to check that the `x-extends` value is a map.
- Neighbors `scripts/contracts/openapi-extensions.ts` and `scripts/contracts/asyncapi-section-fragments.ts` are the OpenAPI and AsyncAPI sides this shared reader serves, per the module doc.
- Covered by `tests/unit/scripts/contracts/extends-map.test.ts`.

## Notes
- `requireDeclared` uses `Object.hasOwn`, so inherited properties don't count as declared.
- `parseExtendsMap` only checks shape; it does not check that the keys or values refer to real schemas. That is `requireDeclared`'s job, and it takes the names as a separate argument.
