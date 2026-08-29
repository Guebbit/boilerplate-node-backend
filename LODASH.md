# Lodash replacement candidates

`lodash`/`lodash-es`/per-method packages (`lodash.debounce`, etc.) are **not
direct dependencies** of this project — they only show up transitively in
`package-lock.json` via other tools (e.g. eslint plugins). This is an audit
of hand-rolled code that overlaps with common lodash functions, in case we
want to pull in `lodash-es` (or just note that we don't need to).

Overall: this is a small, disciplined codebase with no `utils/`/`helpers/`
folder. Very little generic utility code exists — most logic is domain
specific — so the list here is short, and most of it isn't actually worth
replacing.

## 1. `deepMerge` — `src/infrastructure/i18n/catalog.ts:109-122`

Recursively merges `source` into `target`; descends into plain objects,
source wins on any leaf/array/type mismatch. ~14 lines + a 5-line
`isPlainObject` helper (lines 124-125).

Overlaps with `merge` / `mergeWith`. **Not a safe drop-in swap**: arrays and
any non-plain-object are treated as opaque leaves the source fully replaces.
`_.merge` instead merges arrays _by index_
(`_.merge({a:[1,2]}, {a:[9]})` → `{a:[9,2]}`), which would silently change
behavior here. The doc comment is explicit: "anything else (string, array,
mismatch) is a leaf the source replaces." Would need `mergeWith` with a
customizer that returns the source value for arrays.

Same shape as the Vue frontend's `mergeDictionaries` finding — same caveat.

## 2. `compact` — `src/infrastructure/persistence/factory.ts:51-52`

```ts
export const compact = <T extends Record<string, unknown>>(source: T): T =>
    Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as T;
```

Drops `undefined`-valued keys from an object (used across every module's
`factory.ts` for test-fixture overrides). 2 lines.

Overlaps with `_.omitBy(obj, _.isUndefined)` — **not** with lodash's own
`_.compact`, which is array-only (drops falsy values from an array). This
function reuses the name `compact` for a different, object-shaped operation,
which could mislead anyone expecting lodash semantics. Worth a rename
(`stripUndefined` or similar) regardless of whether lodash gets adopted.

**Duplicated logic, different spelling:** the same "strip undefined-valued
keys" idiom is inlined (not extracted) in `src/infrastructure/http/request.ts:256`:

```ts
for (const [key, value] of Object.entries(merged)) if (value !== undefined) result[key] = value;
```

Consolidate these two regardless of lodash.

## 3. `sanitizeStringArray` — `src/modules/products/service.ts:48-51`

```ts
const sanitizeStringArray = (values?: string[] | null): string[] => {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
};
```

Trims, drops empties, de-dupes an array (used for product `categories`/`tags`).
4 lines. Overlaps with `map(trim) → compact → uniq`. The `!Array.isArray`
guard is roughly what `_.uniq(null)` already does (`[]`), so no real custom
behavior — a legitimate one-liner candidate (`_.uniq(values.map(v => v.trim()).filter(Boolean))`)
if lodash were adopted, but short enough that it's not urgent.

## 4. `buildMessageTree` and friends — `src/modules/locales/services/keys.ts:41-117`

`buildMessageTree` (33 lines) turns flat dotted keys into a nested object —
superficially like `_.set` in a loop / `_.zipObjectDeep`. Companion functions
`findUnsafeKeySegment`, `findKeyCollision`, `findBatchCollision`,
`findDuplicateKey` (5-15 lines each) do dotted-path safety/collision checks.

**Do not replace with lodash.** The custom behavior is the entire point:

- **Prototype-pollution defense** — nodes are built with `Object.create(null)`,
  and `__proto__`/`constructor`/`prototype` segments are explicitly rejected.
  `_.set` is a known prototype-pollution vector on ordinary objects; using it
  here without the same guards would reintroduce that bug class.
- **Throws on type collisions instead of silently overwriting** — doc
  comment: "THROWS on a collision rather than dropping a key, and that is the
  point... a builder that quietly picked one would make the outcome depend on
  insertion order." `_.set` silently overwrites/coerces on conflicts.
- The collision/duplicate checks encode domain-specific "dotted prefix
  conflict" logic not expressible as a single lodash call.

## 5. Minor duplicated one-liner: capitalize-first-letter

- `src/infrastructure/http/delete-controller.ts:70`:
  `` `delete${entity.charAt(0).toUpperCase()}${entity.slice(1)}` ``
- `scripts/generate-asyncapi-types.ts:96`:
  `` `${segment.charAt(0).toUpperCase()}${segment.slice(1)}` ``

Overlaps with `_.upperFirst`. 1 line each, used inline to build identifiers.
No custom behavior — trivial, just duplicated across two unrelated files
rather than extracted. Low priority (same pattern also noted in the frontend
repo's `LODASH.md`).

## 6. Minor partial overlap: omit-by-key inside `applySerialization`

`src/infrastructure/persistence/serialize.ts:73-74`:

```ts
for (const key of omit) delete serialized[key];
```

Overlaps with `_.omit(obj, keys)`, but it's a 2-line fragment inside a larger
transform (also renames `_id`→`id`, strips `__v`) — not worth isolating just
to swap in lodash.

## Not found

No `debounce`, `throttle`, `memoize`, `cloneDeep`/deep-clone idiom (no
`structuredClone` or `JSON.parse(JSON.stringify())` clone pattern either),
`isEqual`, `groupBy`/`keyBy`/`sortBy`/`uniqBy` (sorting uses native
`Array.prototype.toSorted` with inline comparators — appropriate, not a
lodash-duplicate), `chunk`, `flatten`/`flattenDeep`, generic `pick`, or
`camelCase`/`kebabCase`/`snakeCase` string-case converters anywhere in `src/`
or `scripts/`.

No `utils/`, `helpers/`, `lib/`, or `common/` directory exists — logic lives
inline in `src/infrastructure/*` and `src/modules/*/service.ts`/`repository.ts`,
which is why the matches above are scattered rather than centralized.

## Recommendation

- **Do first, independent of lodash:** consolidate `compact` (factory.ts) and
  the inlined strip-undefined loop (request.ts) into one function; rename
  away from `compact` since it collides with lodash's actual (different)
  meaning.
- **Worth a `lodash-es` dependency if we do it:** `deepMerge`, same caveat as
  the frontend's merge — needs `mergeWith` + a customizer, not a bare `merge`.
- **Never replace:** `buildMessageTree`'s collision/prototype-pollution
  guards — hand-rolled on purpose, `_.set` would reintroduce a real
  vulnerability class.
- **Not worth it:** everything else is 1-4 lines, low duplication, or already
  simple enough that adding a dependency for it is a net cost.
