---
source: src/infrastructure/object-guards.ts
source_sha256: 98e747784ea86c17355b17237e6bb8f33a91d3c53c53f987b7c5f7ca7f72db0f
context_sha256: 78da18ab7916141e173edb92151ae2cd43ceaad8ab7692a1a59c0026c2cff255
generated_at: 2026-11-22T02:56:49.818499+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/object-guards.ts

## Purpose
Small, generic value guards and object helpers that have no natural home elsewhere. They are narrow enough that unrelated call sites (i18n dictionary merging, locale key trees, HTTP request bodies, test factories) would otherwise each hand-write the same thing.

## Key elements
- `isPlainObject(value)`: type guard narrowing `unknown` to `Record<string, unknown>`. It is true for objects that are neither `null` nor arrays. Callers treat everything else as a leaf rather than a node to descend into or index.
- `stripUndefined(source)`: returns a copy of an object without the keys whose value is `undefined`. It keeps the type `T` via a cast, since `Object.fromEntries` loses it.
- `fillOmittedWithNull(body, fields)`: copies `body` and sets every name in `fields` that is absent to `null`. This expresses "the body IS the new resource" (RFC 9110 §9.3.4) as the change-set a PATCH could have sent. The write side only understands an explicit `null` as "clear". It is used for a PUT body and for a PUT translation entry.

## Relationships
The file has no imports. It is a leaf utility consumed by the neighbors listed in the graph. The source documents these specific uses:
- `src/infrastructure/http/request.ts` (`readInput`) uses `stripUndefined` so a `||`-merged request does not carry explicit `undefined`s into a Mongoose filter.
- Test factories (such as `src/modules/addresses/factories.ts` and `src/modules/locales/factories.ts`) use `stripUndefined` so `{ stock: undefined }` spread over a default does not override the model's own `default:`.
- `isPlainObject` serves i18n dictionary merging, locale key trees, and HTTP request-body checks. The `src/infrastructure/i18n/catalog.ts`, `src/modules/locales/services/keys.ts` and `src/infrastructure/http/middlewares/json-object.ts` neighbors fit these descriptions.
- `fillOmittedWithNull` serves the PUT handling. The `src/infrastructure/surfaces/create-update-controller.ts` neighbor fits that role.

## Notes
- `stripUndefined` is deliberately not named `compact`. lodash's `compact` is array-only and drops falsy values, so the same name would invite the wrong assumption.
- `stripUndefined` only removes `undefined`. `null` and other falsy values are kept.
- `stripUndefined` is shallow. It filters top-level entries only.
- `fillOmittedWithNull` tests absence with `field in filled`. A key that is present with an `undefined` value is therefore not replaced with `null`.
