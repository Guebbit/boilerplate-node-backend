# Dynamic locales — plan

Turning `locales` from a read-only view over deployed files into a module that owns a database:
languages added at runtime, words edited without a deploy, and a dictionary a client can download
for a language it does not ship.

**Status: built, phases A and B, on 2026-08-17.** Moved out of `ODDITIES.md` earlier the same day,
where it was filed as "a module with no locales" — the curiosity turned out to be a missing
feature. Phase C is still not scheduled, and §9 still says why.

Everything below is kept as it was written, because it is the reasoning rather than the record.
Where the build differs from it, §15 says so and why.

---

## 1 · What this is for

The frontend bundles some languages in its own code and lazy-loads them with a dynamic import.
That covers the languages it knew about at build time. It does not cover:

- a language added **after** the frontend was deployed;
- copy edited by someone who does not open a code editor;
- a language the frontend never shipped at all — the working example is Spanish.

So the client's resolution order becomes:

| Step | Source                                 | When                                        |
| ---- | -------------------------------------- | ------------------------------------------- |
| 1    | its own bundle, via `import()`         | the language shipped with the frontend      |
| 2    | **`GET /locales/:tag/messages`** (new) | it did not — fetch the dictionary from here |
| 3    | its bundled fallback                   | step 2 fails or the language is unknown     |

Step 2 is what this plan builds, together with the admin surface that fills it.

---

## 2 · The one architectural decision everything else follows from

**Two tiers, and they never merge.**

|                                                | Tier 1 — static                                                    | Tier 2 — dynamic                  |
| ---------------------------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| Lives in                                       | `src/locales/*.json` + `src/modules/*/locales/*.json`              | MongoDB                           |
| Contains                                       | the API's **own** copy — error messages, email subjects (~60 keys) | the **client's** copy — view text |
| Loaded by                                      | `src/infrastructure/i18n.ts` → i18next at boot                     | nothing at boot; read per request |
| Read by `t()`?                                 | **yes**                                                            | **never**                         |
| Affects `negotiateLocale`, `Content-Language`? | **yes**                                                            | **never**                         |
| Served at                                      | `GET /locales/:tag`                                                | `GET /locales/:tag/messages`      |
| Editable at runtime?                           | no                                                                 | yes, that is the point            |

**Why the API's own copy stays on the filesystem, permanently.** It exists to let a client render
copy _when no response arrives_ — a network failure, a bare 502. Putting it behind a database makes
it unavailable in precisely the situation it was created for: not a store, a second failure mode.
There is a second reason, in `i18n.ts`'s own words: `listSupportedLocales()` is cached per worker
because a per-request directory read would let the negotiated locale and the resolvable locale
disagree — _"a header that lies is worse than the language being unavailable."_ A database
reintroduces exactly that race.

**What the separation buys.** Because nothing in the request path reads tier 2, **the dynamic tier
cannot break the running API**. Mongo down, a language half-translated, a malformed key — the worst
outcome is one endpoint returning 503 while every other response still resolves its own copy
normally. That property is worth more than any convenience gained by merging the two, and every
decision below is made to preserve it.

**The trap this avoids, stated plainly:** a language existing in the database does **not** mean the
API can answer in it. If `es` exists only in tier 2, the API still cannot emit `Content-Language:
es` — i18next has no Spanish resource and never will until a file is deployed. `GET /locales` must
therefore never present the two as the same capability. §5 is how.

---

## 3 · Data model

Two collections, both owned by the `locales` module.

### `locales` — the languages

| Field                     | Type               | Notes                                                                 |
| ------------------------- | ------------------ | --------------------------------------------------------------------- |
| `tag`                     | string, **unique** | BCP-47, lowercased on write (`es`, `pt-br`)                           |
| `name`                    | string             | English name, for the admin list — `Spanish`                          |
| `nativeName`              | string             | for a client's language picker — `Español`                            |
| `direction`               | `'ltr' \| 'rtl'`   | the client needs it for layout; trivial now, a migration later        |
| `active`                  | boolean            | inactive = invisible to every public route. Draft languages need this |
| `revision`                | integer            | bumped on **any** write to this language's entries — see §6           |
| `createdAt` / `updatedAt` | Date               | `timestamps: true`, as every other model                              |

### `localeMessages` — the words

| Field                     | Type   | Notes                                                                              |
| ------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `locale`                  | string | the `tag` above. Not an ObjectId reference — see below                             |
| `key`                     | string | flat and dotted: `products.list.title`. Stored **as a string**, never a Mongo path |
| `value`                   | string | the translated text                                                                |
| `createdAt` / `updatedAt` | Date   |                                                                                    |

Indexes (one migration, §10): `{ tag: 1 }` unique on `locales`; `{ locale: 1, key: 1 }` unique on
`localeMessages`; `{ locale: 1 }` for the whole-dictionary read.

### Why one row per (locale, key)

Two alternatives were considered and both are worse:

- **One document per language**, `{ locale, messages: { … } }`. Editing one word becomes
  `$set: { "messages.products.list.title": v }` — and because the keys themselves are dotted, Mongo
  reads that as three levels of nesting rather than one key. You would have to store keys with the
  dots escaped, which is a trap that bites once and then keeps biting.
- **One row per key, all languages**, `{ key, translations: { en, it, es } }`. Adding a language
  touches every document, and a partial import for one language has to read-modify-write rows that
  another language shares.

One row per (locale, key) makes every operation this feature needs a one-line indexed query — add is
an insert, edit is an `updateOne`, remove is a `deleteOne`, a whole dictionary is one `find` — and
adding a language touches nothing that already exists. The cost is that a 500-key language is 500
documents, which at this scale is nothing: the dictionary read is one indexed query returning tens
of kilobytes, and it is cached for an hour.

### Why `locale` is the tag string, not a reference

The read path is "give me every row for `es`", and a string match on an indexed field answers it
without a join or a populate. A reference would buy referential integrity, which is instead enforced
where it actually matters: the delete route refuses to remove a language that is still active (§4),
and the cascade happens in one place.

### What is deliberately **not** in the model

A `scope: 'api' | 'app'` field, which would let the database override the API's own copy. It is
phase C (§9) and it is not speculatively added now — this repo's manifest doc says it plainly, _"a
field that only one module ever fills does not belong here"_, and the same applies to a field
nothing fills. `db/migrations/` already holds ten migrations; adding a column is a cheap, solved
problem, and guessing at it now is not.

---

## 4 · Routes

The naming distinction that keeps this from collapsing into confusion:

> **`messages` is the built dictionary** — public, read-only, nested, one object.
> **`entries` are the rows** — admin, CRUD, flat, paginated.

One endpoint trying to be both is how this feature usually goes wrong.

### Public — cached, unauthenticated

| Method | Path                     | Answers                                                                    |
| ------ | ------------------------ | -------------------------------------------------------------------------- |
| `GET`  | `/locales`               | the manifest: static ∪ active dynamic languages (§5). **Changes shape.**   |
| `GET`  | `/locales/:tag`          | the API's own dictionary. **Unchanged.**                                   |
| `GET`  | `/locales/:tag/messages` | the dynamic dictionary as nested JSON. **New.** 404 if unknown or inactive |

### Admin — `getAuth, isAuth, isAdmin`, each write wrapped in `invalidateCache(['locales'])`

| Method   | Path                             | Notes                                                                        |
| -------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `POST`   | `/locales`                       | create a language. 409 on a duplicate tag                                    |
| `PUT`    | `/locales/:tag`                  | edit `name`, `nativeName`, `direction`, `active`                             |
| `DELETE` | `/locales/:tag`                  | remove it **and cascade its entries** — refuses unless `active: false` first |
| `GET`    | `/locales/:tag/entries`          | paginated, searchable list of `{ id, key, value }` for the editor            |
| `POST`   | `/locales/:tag/entries`          | add one key. 409 if the key exists or collides (§7)                          |
| `PUT`    | `/locales/:tag/entries/:entryId` | edit one value                                                               |
| `DELETE` | `/locales/:tag/entries/:entryId` | remove one key                                                               |
| `PUT`    | `/locales/:tag/entries`          | **bulk replace** the whole set. Returns `{ created, updated, removed }`      |
| `PATCH`  | `/locales/:tag/entries`          | **bulk merge** — upsert what is sent, leave the rest alone                   |

**Why entries are addressed by `entryId` and not by key.** Keys contain dots and could contain
anything else awkward in a URL path. The key stays a body field with uniqueness enforced by the
index, and the row is addressed by its id — the same shape as `/account/addresses/:addressId`.

**Why `DELETE /locales/:tag` requires `active: false` first.** It removes a language _and_ every
string translated into it. A two-step makes a mis-click cost a toggle instead of a day's
translation work, and the inactive state is one an admin has a reason to use anyway.

**Why bulk import is not optional.** Nobody adds 500 keys through a form. Without `PUT`/`PATCH` on
the collection, the feature is a demo. Both are explicit about their semantics in the method itself
— `PUT` replaces (what is not sent is deleted), `PATCH` merges (what is not sent is left alone) —
because "does import delete missing keys" is the question every translation tool gets wrong.

---

## 5 · The manifest — `GET /locales`

Today it answers `{ locales: ['en','it','es'], default, fallback }`, derived from
`listSupportedLocales()`. It must now describe two sources with **different capabilities**, without
implying they are the same thing:

```jsonc
{
    "locales": [
        {
            "tag": "en",
            "name": "English",
            "nativeName": "English",
            "direction": "ltr",
            "scopes": ["api"],
            "source": "static",
            "entryCount": 0,
            "revision": 0
        },
        {
            "tag": "it",
            "name": "Italian",
            "nativeName": "Italiano",
            "direction": "ltr",
            "scopes": ["api"],
            "source": "static",
            "entryCount": 0,
            "revision": 0
        },
        {
            "tag": "es",
            "name": "Spanish",
            "nativeName": "Español",
            "direction": "ltr",
            "scopes": ["api", "app"],
            "source": "both",
            "entryCount": 214,
            "revision": 7
        }
    ],
    "default": "en",
    "fallback": "en"
}
```

| Field        | Means                                                                                   |
| ------------ | --------------------------------------------------------------------------------------- |
| `scopes`     | `api` = the API can answer requests in it. `app` = a client dictionary is downloadable. |
| `source`     | `static` \| `dynamic` \| `both` — which tier it came from                               |
| `entryCount` | rows in `localeMessages`. Spots a half-translated language at a glance                  |
| `revision`   | the client's "do I need to re-download" check — see §6                                  |

`scopes` is the field doing the real work. Without it, a client seeing `es` in the list cannot tell
whether it may send `Accept-Language: es` and get Spanish error messages (it may not, until a file
is deployed) or whether it may download a Spanish UI dictionary (it may). Those are different
questions and they now have different answers.

**Merge rules.** Static tags come from `listSupportedLocales()` exactly as today. Dynamic tags come
from `locales` where `active: true`. A tag present in both merges into one row with
`scopes: ['api','app']` and `source: 'both'`; the static side wins nothing, because the fields do
not overlap — the static tier has no `name`/`nativeName`/`direction` to contribute, and a
static-only language shows English defaults derived from the tag. Ordering is by tag, so the
response is stable.

**Contract change.** `LocaleCapabilities` in `src/modules/locales/openapi.yaml` moves from an array
of strings to an array of objects. Breaking, and irrelevant — see `ODDITIES.md` §0.

---

## 6 · Caching and invalidation

Three separate caches, and it matters that they stay separate:

1. **HTTP response cache.** Both public routes already carry `setCache(3600, { tags: ['locales'] })`
   (`src/modules/locales/routes.ts`). The new dictionary route joins them, keyed on `:tag`. Every
   admin write wraps in `invalidateCache(['locales'])`, which per its own docblock stores cached
   responses and tag sets in **shared Redis**, so _"one call covers every app instance… no
   cross-instance broadcast is involved."_ Clustered invalidation is therefore already solved and
   needs no new machinery.
2. **`listSupportedLocales()`'s per-worker cache.** **Untouched.** Dynamic languages never enter
   i18next, so the list of languages the API can _resolve_ never changes at runtime. This is the
   payoff of §2's split: the one cache in this codebase whose staleness would be dangerous is the
   one this feature does not go near.
3. **The client's own copy.** Answered by `revision`, an integer on the language document bumped in
   the same write as any entry change. A client stores the revision it downloaded and re-fetches
   only when the manifest reports a higher one.

**Why `revision` and not a content hash.** A hash means reading and hashing every row of every
language on each manifest request — an O(rows) cost on the most-cached endpoint in the API, to
answer a question a counter answers exactly as well. The bump belongs in the repository, in the same
operation as the write, so no code path can change an entry without moving the number.

Express is already configured for strong ETags (`src/app/security.ts:45`), so a client that
re-requests an unchanged dictionary gets a 304 with no body regardless.

---

## 7 · Building the dictionary, and the collision that will bite

`GET /locales/:tag/messages` turns flat rows into the nested shape `GET /locales/:tag` already
serves, so the client has **one** merge path for both:

```
{ locale: 'es', key: 'products.list.title', value: 'Catálogo' }
{ locale: 'es', key: 'products.list.empty', value: 'Sin resultados' }
        ↓
{ "products": { "list": { "title": "Catálogo", "empty": "Sin resultados" } } }
```

**The failure mode.** If both `products.list` and `products.list.title` exist, no tree can hold
them — one is a string, the other needs to be an object at the same path. A naive builder silently
drops one, and which one depends on insertion order.

**Fix it at write time, not read time.** Every write (single, bulk replace, bulk merge) rejects a
key that is a strict prefix of an existing key in that language, or that has one as a prefix, with a
409 naming both keys. The read-time builder then throws rather than dropping, and a unit test
asserts it throws — because a builder that cannot fail is a builder that hides this.

Second, smaller decision: **serve nested, not flat.** It matches the existing endpoint, matches what
i18next-style clients expect, and keeps the client from needing two merge strategies. The rows stay
flat because that is what makes them editable one at a time.

---

## 8 · Module shape after this lands

`locales` stops being the thin module `ODDITIES.md` used to describe. It gains a full stack:

```
src/modules/locales/
├── model.ts          # localeSchema + localeMessageSchema, both with applySerialization
├── repository.ts     # the queries, including the revision bump
├── service.ts        # localeService — tree building, merge rules, collision checks, cascade
├── controllers/
│   ├── get-locales.ts             # manifest + API dictionary (exists; manifest rewritten)
│   ├── get-locale-messages.ts     # the built dictionary
│   ├── write-locales.ts           # POST + PUT on a language
│   ├── delete-locale.ts           # the guarded cascade
│   ├── get-locale-entries.ts      # paginated admin list
│   ├── write-locale-entries.ts    # POST + PUT on one entry, and the two bulk routes
│   └── delete-locale-entry.ts
├── routes.ts
├── seeds.ts          # new
├── audit.ts          # new — admin.locale.* actions
├── openapi.yaml      # substantially extended
├── locales/          # ← its own copy, for its own error messages. It finally has one.
└── tests/
```

Controller filenames follow `<verb>-<thing>.ts` / `write-<thing>.ts`, which is the convention
`ODDITIES.md` entry 4 settles on — do not introduce a resource-form filename here.

`module.ts` changes: keep `name`, `basePath: '/locales'` and `subdomain: 'generic'` (a translations
admin is something every application grows and none of them differ). Add `seeds`, `seedExport`,
`locales`, and extend the `language` block with the terms this module now means precisely —
_Language_, _Entry_, _Dictionary_, _Revision_, _Scope_. Delete the stale paragraph claiming keys are
flat and global; it describes a world that stopped existing when per-module namespaces landed.

**Still no `index.ts`.** Nothing imports this module, and after this it still should not: everything
the rest of the app needs from i18n comes from `@infrastructure/i18n`, which sits below modules and
must stay there.

`audit.ts` is not optional — `tests/cross-cutting/audit-actions.test.ts` sweeps every module for its
action vocabulary and asserts uniqueness plus the `noun.noun.verb` shape. Admin writes that change
what users read are exactly what an audit trail is for: `admin.locale.created`,
`admin.locale.updated`, `admin.locale.deleted`, `admin.locale-entry.updated`,
`admin.locale-entry.imported`.

---

## 9 · Phases

Each phase is independently shippable and independently useful. **Ordering is a hard constraint in
one place:** `@types` re-exports `@api/models`, which orval generates from `openapi.yaml`. So the
contract fragment lands and `npm run gen:api` runs **before** the model can be written — every model
in this repo types its document against the generated shape. Contract first, generate, then code.

### Phase A — the read path

Delivers the actual ask: a client downloads a language the backend has and it does not.

1. `openapi.yaml` fragment: `Locale`, `LocaleMessage`, the new `LocaleCapabilities` object form, the
   dictionary response. → `contracts:bundle` → `gen:api`.
2. `db/migrations/<ts>-locale-collections.js` — three indexes (§3).
3. `model.ts`, `repository.ts`, `service.ts` — tree builder, collision detection, manifest merge.
4. `get-locale-messages.ts`, the rewritten manifest in `get-locales.ts`, routes with `setCache`.
5. `seeds.ts` + `seedExport`, wired into `module.ts` (§11).
6. Tests (§12), then `sync:frontend` and `npm run complete`.

### Phase B — the write path

1. Contract fragment for the admin routes → regenerate.
2. `audit.ts`, the CRUD controllers, the two bulk routes, `invalidateCache(['locales'])` on each.
3. The guarded cascade delete, and the revision bump inside the repository.
4. Tests: contract coverage for every route, 401/403, 409 on duplicate and on collision, replace-vs-
   merge semantics.

### Phase C — overriding the API's own copy — **not scheduled**

Only if editing the backend's own error and email copy without a deploy is ever genuinely wanted.
It means a `scope` column, and a way for `t()` to see database rows — which `infrastructure` cannot
read directly, since it must not import a module. The inversion already has precedent twice over:
`registerLocaleDirectories(directories)` and `registerAuditSink(sink)` are both ports that
`app.ts` wires at boot. A `registerLocaleOverrides(provider)` would follow the same shape.

**If it is ever built, the files stay the floor.** Overrides layer on top; an empty or unreachable
database means the deployed copy is served, unchanged. The guarantee in §2 is not negotiable, and
Phase C is the only part of this plan that could threaten it.

---

## 10 · Migration

One file, `db/migrations/<timestamp>-locale-collections.js`, following the ten already there:

- `locales`: unique index on `{ tag: 1 }`
- `localeMessages`: unique compound on `{ locale: 1, key: 1 }` — this is what makes duplicate-key a
  database guarantee rather than a service-layer hope
- `localeMessages`: `{ locale: 1 }` for the dictionary read

`down` drops all three. No data migration: both collections start empty and the seeder fills them.

---

## 11 · Seeds

Same philosophy as the existing seeders — _a branch with no fixture is a branch nothing tests._

| Fixture                              | Exists to cover                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `es` — active, ~10 entries           | **The whole point of the feature**: a language the frontend does not bundle, downloadable     |
| a nested key set at least 2 deep     | the tree builder has a real fixture rather than a flat list                                   |
| one inactive language (`fr`, 2 rows) | the visibility branch — an inactive language must be absent from the manifest and 404 on read |
| `en`                                 | **not seeded.** It is static-only, and the manifest merge needs a static-only row to merge    |

`seedExport` publishes both collections into `db/seeds/dataset.json`, so the paired frontend's mocks
can answer the new endpoints. Both are **stored rows**, not responses: the manifest is a merge of
two sources and the dictionary is built from the rows, so neither collection is what any endpoint
returns. That distinction is the subject of `ODDITIES.md` entry 3, currently parked — these two
collections make the case for un-parking it, since they are the first ones whose stored-vs-served
gap is not obvious from the name.

`dataset.json` is `owner: 'backend'` in `scripts/specIdentity.ts`, so it propagates with
`npm run sync:frontend`.

---

## 12 · Tests

**Unit** (`src/modules/locales/tests/unit/`)

- tree builder: nesting, empty language, single flat key, deep key
- tree builder: **throws** on a prefix collision rather than dropping a key
- write-time collision rejection, both directions (`a.b` blocked by `a.b.c`, and the reverse)
- manifest merge: static-only, dynamic-only, both; inactive excluded; stable ordering
- `revision` bumps on create, edit, delete, and both bulk operations — and **not** on a read
- cascade delete refuses while `active: true`

**Contract** (`src/modules/locales/tests/contract/`)

- every route satisfies `openapi.yaml` via `toSatisfyApiSpec`
- `GET /locales/:tag/messages` — 200 for the seeded `es`, 404 for the inactive language, 404 for an
  unknown tag
- admin routes: 401 unauthenticated, 403 as a non-admin, 200 as admin
- 409 on a duplicate tag, 409 on a duplicate key, 409 on a collision
- 422 on an invalid body
- `PUT /entries` removes what was not sent; `PATCH /entries` does not — asserted as a pair, since
  this is the semantic most likely to be implemented backwards

**Integration** (`tests/integration/`)

- an admin write invalidates the cached public dictionary — the tag-based invalidation actually
  reaching the cached response, not just the call being made

**Cross-cutting** — mostly automatic, which is the point of those sweeps

- `audit-actions.test.ts` picks up `locales/audit.ts` once it exists and enforces uniqueness and the
  dotted shape
- `seed-conformance.test.ts` gains the two new collections
- `locale-namespaces.test.ts` and `locale-parity.test.ts` are about **tier 1** and must stay that
  way. Do not extend them over database rows: static parity is a build-time property, dynamic
  completeness is `entryCount` in the manifest, and conflating them would make a half-translated
  language fail the test suite of a repo that does not own the translation

**The tier-1 defect to fix first, independent of all of this:** `locale-parity.test.ts` asserts key
parity for **`en` and `it` only**. `es.json` exists in `src/locales/` and in all eleven module
locale directories — Spanish is both the language this whole feature is built around and the one
language whose static completeness nothing verifies. Iterate `listSupportedLocales()` instead of
naming two tags. Ten lines, and it should land before Phase A.

---

## 13 · Risks, and what each one costs

| Risk                                                 | Mitigation                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A dynamic language read as "the API speaks this"     | `scopes` in the manifest (§5), and tier 2 never touching i18next (§2)                   |
| Prefix collisions silently dropping a key            | 409 at write time in every path; the builder throws; a unit test asserts the throw (§7) |
| Bulk import deleting keys nobody meant to delete     | `PUT` replaces / `PATCH` merges, asserted as a paired contract test (§4, §12)           |
| Deleting a language wiping a day of translation      | delete refuses unless already inactive (§4)                                             |
| Mongo down taking the whole API's copy with it       | cannot happen — tier 1 is filesystem and boot-loaded (§2)                               |
| Manifest cost growing with the number of rows        | `revision` counter, not a per-request content hash (§6)                                 |
| `dataset.json` growing and forking from the frontend | `seedExport` + `sync:frontend`; `check:spec-identity` fails on a fork (§11)             |
| A large new contract surface drifting from the code  | contract-first ordering is forced by `@types` ← orval (§9)                              |

---

## 14 · Open questions

1. **Who writes the copy?** If it is always a developer, most of Phase B is a worse text editor than
   git. The admin CRUD earns its place when a non-developer edits — confirm that is the intent
   before building the editor endpoints.
2. **Does the frontend need per-key fallback?** When `es` is 80% translated, does a missing key fall
   back to the client's bundled `en`, or does the API fill the gap? Recommendation: the **client**
   falls back, and the API never invents a value. A gap must stay visible, and a server-side
   fallback makes `entryCount` a lie.
3. **One dictionary per client, or one per deployment?** This plan assumes one. Multiple frontends
   sharing the backend would want a namespace column, which is a phase-C-shaped change.
4. **Does `active: false` mean "hidden" or "draft"?** They are the same flag here. If a language ever
   needs to be published-but-hidden, that is a second field, not a reinterpretation of this one.

---

## 15 · What shipped, and where it differs from the plan above

The build follows §1–§12. Eleven things came out differently, and each is a decision rather than a
shortcut.

### Naming, forced by the shared contract

1. **The path parameter stays `{locale}`, the stored field is `tag`.** §4 wrote `:tag` throughout.
   `openapi.root.yaml` already owns a `Locale` scalar and `/locales/{locale}` already existed, so
   two spellings of the same position in one document would have been the confusing half of a
   rename nobody asked for. The row still calls its identifier `tag`, because that is what a row
   about a language calls it.
2. **The entity is `Language`, not `Locale`.** Redocly bundles every module's schemas into one
   `components.schemas`, where `Locale` is already the BCP-47 string. `Language`, `LocaleEntry`,
   `LocaleCapability` and `LocaleMessages` are the names that survived the collision, and they
   match the vocabulary `module.ts` now declares.
3. **The audit noun is `locale_entry`, not `locale-entry`.**
   `tests/cross-cutting/audit-actions.test.ts` requires lower snake_case in every segment, so the
   hyphen §8 proposed would have failed the sweep the same file recommends relying on.

### Shape

4. **`LocaleEntry` carries `locale`, `createdAt` and `updatedAt`.** §4 described the editor row as
   `{ id, key, value }`. Publishing the stored shape instead makes stored-and-served the same
   object for this collection, which is what lets `seed-conformance` parse `dataset.json` against
   the generated schema with `.strict()` rather than against a hand-written subset.
5. **`GET /locales/:tag/messages` also returns `revision`.** A client that has just downloaded a
   dictionary knows which revision it holds without a second request to the manifest, and the two
   cannot be compared wrongly by arriving out of order.
6. **The entries list is not cached.** Every other locale read is. This one is the screen a
   translator is typing into, where a stale page means editing a value that has already moved, and
   the saving would be one indexed query behind an admin token.

### Correctness the plan did not reach

7. **`GET /locales` degrades instead of failing.** §2 promises that the dynamic tier cannot break
   the running API, but §5 then made the manifest a database read — and the manifest is what a
   client asks when everything else has already failed it. `readDynamicTier` swallows a database
   failure, logs at warn, and serves the static half alone. The languages the API can _answer_ in
   are held in memory and always answer.
8. **Keys are refused for unsafe segments, with a 422 rather than a 409.** `__proto__`,
   `constructor`, `prototype` and empty segments name nodes no client could address, and the first
   is prototype pollution reached through a translation key. The tree builder additionally uses
   null-prototype nodes, so a row that reached the collection some other way still cannot pollute
   anything — `service.test.ts` asserts both halves.
9. **A collision is checked against what will SURVIVE the write, not against what is stored.** A
   bulk replace deletes `products.list.title` on its way in, so `products.list` is consistent with
   itself and is accepted; the same batch as a merge is a 409. Checking against rows the import is
   about to delete would refuse imports that are perfectly correct.

### Indexes

10. **Two indexes, not three.** §3 and §10 asked for `{ locale: 1 }` alongside
    `{ locale: 1, key: 1 }`. A compound index serves queries on any prefix of its keys, so the
    unique one already answers the whole-dictionary read, and the extra index would be write cost
    buying nothing — which is exactly what `20260808180000-prune-unused-indexes.js` exists to have
    removed. Mongo's collection name is `localemessages`, lowercased and pluralised from the model
    the way `auditlogs` is.

### Loose end

11. **`ODDITIES.md` no longer exists.** §5, §8 and §11 above cite it — for the contract-change
    note, the controller-filename convention, and the parked stored-vs-served entry. Those
    citations are dangling. The conventions themselves were followed from the code.

### And the defect §12 asked for first

`tests/cross-cutting/locale-parity.test.ts` iterated `en` and `it` by name; `es.json` had been in
`src/locales/` and in every module directory the whole time with its completeness checked by
nothing. It now iterates `listSupportedLocales()`, so a language added tomorrow is covered by
existing. That landed before Phase A, as recommended.

### The defect the fuzz suite found, which nothing else would have

`POST /locales` and `PUT /locales/:tag` answered **500 to a display name of one space**.
`minLength: 1` in the contract is satisfied by `" "`; the controller and the Mongoose schema then
both trim, so the value reaches a `required: true` column as `""`. That is a Mongoose
`ValidationError`, and `databaseErrorInterpreter` recognises `CastError`, `BSONError` and E11000 —
not that — so it fell through to the 500 branch. A stray space reported as a server fault, on an
admin route, found by `tests/fuzz/endpoints.fuzz.test.ts` on its third generated case.

Fixed where the constraint can actually be expressed: `z.string().trim().min(1)`, extended onto both
generated bodies in the controller, the way `feedback` extends its `adminNotes` cap. JSON Schema has
no notion of "non-empty after trimming", so the contract cannot state it and a comment says why. Four
contract tests hold it — both fields, both routes.

**The wider finding is left alone deliberately.** Any Mongoose `ValidationError` reaching the
response layer is a 500 today, and nearly all of them are really 422s. That fix belongs in
`@infrastructure/http/errors`, in a change reviewable against every module at once — not smuggled in
here on the back of one endpoint.

### `sync:frontend` grew a flag

The script copied files and then _printed_ the two commands to run in the frontend, with a comment
calling that "the one thing this cannot do for you". It is now opt-in instead:

```
npm run sync:frontend -- --regen    # copy, then run the frontend's own `npm run regenerate`
```

A flag and not the default, because it executes ANOTHER repo's npm scripts: a frontend with stale
`node_modules` would fail a command in this repo, reading like the sync broke when it did not. The
failure path says whose build failed and leaves the copy standing.

The existing "still differs after copying" integrity check now sits _after_ the regeneration, so it
covers it — the frontend's `regenerate` ends in `prettier:fix`, and a shared document reformatted by
it would fork the two repos while every check on this side passed. That repo's `.prettierignore`
excludes the REST contract for exactly this reason; this is what would notice if it stopped.

Run, with `--regen`. `check:spec-identity` reports 7 of 7 identical, and `npm run complete` exits 0.
The frontend's uncommitted `ProcessMemory` edit to its own `openapi.yaml` was overwritten, as
decided — that file is `owner: 'backend'` in `specIdentity.ts`, so a local edit to it was always
going to be reverted by the next sync.
