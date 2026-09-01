# LODASH.md

## Purpose

Audit of hand-rolled code in this codebase that overlaps with common `lodash`/`lodash-es` functions, to determine whether pulling in `lodash-es` is worthwhile. Concludes the codebase is small and domain-specific, most candidates are not worth replacing, and one (`buildMessageTree`) must never be replaced for security reasons.

## Key elements

- **`deepMerge`** (`src/infrastructure/i18n/catalog.ts:109–122`) — recursive merge where arrays/type-mismatches are opaque leaves (source wins). *Not* a drop-in for `_.merge` (which merges arrays by index).
- **`compact`** (`src/infrastructure/persistence/factory.ts:51–52`) — strips `undefined`-valued keys from an object. Name collides with lodash's array-only `_.compact`; recommended rename to `stripUndefined`. Duplicated logic exists inline in `request.ts:256`.
- **`sanitizeStringArray`** (`src/modules/products/service.ts:48–51`) — trim, drop empties, de-dupe a string array. Trivial 4-liner; low-priority lodash candidate.
- **`buildMessageTree` + collision checks** (`src/modules/locales/services/keys.ts:41–117`) — builds a nested object from dotted keys with `Object.create(null)` prototype-pollution defense and throw-on-collision semantics. **Must not be replaced** with `_.set`/`_.zipObjectDeep`.
- **Capitalize-first-letter one-liner** (duplicated in `delete-controller.ts:70` and `scripts/generate-asyncapi-types.ts:96`) — trivial `_.upperFirst` equivalent; low priority.
- **`applySerialization` omit fragment** (`src/infrastructure/persistence/serialize.ts:73–74`) — 2-line `delete` loop; part of a larger transform, not worth isolating.
- **"Not found" list** — confirms absence of `debounce`, `throttle`, `memoize`, `cloneDeep`, `isEqual`, `groupBy`, `chunk`, `flatten`, generic `pick`, and string-case converters anywhere in `src/` or `scripts/`.
- **Recommendation** — consolidate + rename `compact`; optionally adopt `lodash-es` for `deepMerge` (with `mergeWith` customizer); never touch `buildMessageTree`; skip the rest.

## Relationships

No graph neighbors. The document is a standalone audit note; it references (but is not imported by) the source files it catalogs.

## Notes

- `compact` ≠ lodash `_.compact`. The local version operates on objects (strips `undefined` keys); lodash's operates on arrays (drops falsy). Anyone searching for `_.compact` semantics will be misled.
- `deepMerge` treats arrays as opaque leaves; `_.merge` merges arrays element-by-element. A naive swap silently changes i18n catalog merge behavior.
- `buildMessageTree` uses `Object.create(null)` and rejects `__proto__`/`constructor`/`prototype` segments. `_.set` on plain objects is a known prototype-pollution vector — replacing it reintroduces that bug class.
- Sorting in this codebase uses native `Array.prototype.toSorted` with inline comparators; this is intentional and not a lodash gap.
- No `utils/`, `helpers/`, `lib/`, or `common/` directory exists. Utility logic is scattered inline in `src/infrastructure/*` and per-module `service.ts`/`repository.ts` files.
