# Contract plan — polymorphism

Where this API offers several spellings of one operation, where it does not, and what it would
cost to close each gap. Written 2026-08-23, after the `GET /feedback` body was removed and the
`list` surface was added. Updated 2026-08-24: the two open questions below are now decided — see
**Dispositions** — and `CONTRACT_PLAN_POST_AS_GET.md` was absorbed into this file and deleted.

**Read the theory first if you have not:** `docs/theory/request-input.md` explains _how_
multi-source input works (`readInput`, the surface table, the precedence rules). This file is the
_where and whether_ — a backlog with verdicts, not a description of the machinery.

---

## Dispositions

The rules that resolve the two questions several spellings of one operation keep raising. Both are
implemented, tested and mirrored in the code that reads polymorphic routes.

### 1. Sources are ranked — except `hardDelete`

Default: **params > query > body**, per surface, as `SURFACE_SOURCES` declares. The higher source
is taken to be the more explicit statement of intent.

`hardDelete` is the one declared exception. It is OR'd:

| Sources say             | Result                                                      |
| ----------------------- | ----------------------------------------------------------- |
| any of them `true`      | `true`                                                      |
| all `false`             | `false`                                                     |
| none of them, or blank  | absent — the schema applies the contract's `default: false` |
| any of them undecodable | passed through → 422, never outvoted by a `true` elsewhere  |

**Why.** `false` is the default, so it is a value nobody normally types. Under a ranking, a `false`
that only meant "unset" would outrank a `true` a caller deliberately spelled, purely because it
rode the higher-precedence transport. OR has no such asymmetry: the only way to get a hard delete
is for someone to have asked for one, and the only way to avoid one is for nobody to have.

The last row is the safety property — OR must not become a way to launder a malformed value into a
destroy.

**Where it lives.** `anyTrue` on the `readInput` declaration
(`src/infrastructure/http/request.ts`), declared by `createDeleteController`. Listing a field there
also decodes it as a boolean, so it does not additionally belong in `booleans`. Pinned by
`tests/unit/infrastructure/http/request.test.ts` and, on the wire, by the products contract suite.

### 2. A value outside a closed set — read vs write

| Where           | Value outside the set                                         |
| --------------- | ------------------------------------------------------------- |
| absent          | the filter is simply not applied                              |
| a READ's filter | **matches nothing** — never widened to "return everything"    |
| a WRITE's field | **422**, from the generated Zod enum, before any handler runs |

**Why the two differ.** A read can fail closed and still answer honestly. A write has no safe
narrowing of a value it cannot understand — only a rejection.

**Where it lives.** `toFeedbackStatus` in `src/modules/feedback/service.ts` is the read half:
`search` still sets the scope key, and `{ status: undefined }` matches no document.
`put-feedback-status.ts` is the write half, where `UpdateFeedbackRequestStatusBody` rejects first.
Both halves carry the disposition as a comment.

---

## The trigger rule

> **Add a `POST /x/search` sibling the day a filter set stops fitting comfortably in a URL.
> Not before, and not for symmetry.**

Every alternate spelling is a real, permanent cost:

| Cost                                | Paid where                                                               |
| ----------------------------------- | ------------------------------------------------------------------------ |
| One more generated client function  | `api/`, and the paired frontend's `contracts/rest/`                      |
| One more zod body schema            | `api/schemas.zod.ts`                                                     |
| Two frontend registry rows          | the module's `response-schemas.ts` **and** `response-schema-map.spec.ts` |
| One more route to authorize         | `routes.ts` — a middleware chain that must match its sibling's           |
| One more surface to test            | contract suite, both spellings                                           |
| One more thing a consumer must pick | which is why `x-alias-of` now exists                                     |

Symmetry is not a reason. "This resource has a `/search` and that one does not" is only a defect
if the second one's filters have outgrown a query string.

**Rough threshold: ~8 filters, or any filter that is an array or a nested object.** `GET /products`
sits at 8 and has a sibling. `GET /inventory/levels` sits at 3 and does not need one.

---

## What a `/search` sibling is, and the rules that keep it legitimate

_Absorbed from `CONTRACT_PLAN_POST_AS_GET.md`, which this file replaces._

`POST /products/search` does not create a product. It is a **read wearing a write's method**,
because the question does not fit in a URL. That is the recognised escape hatch — Elasticsearch,
GitHub and Stripe all spell it this way — and the alternative is the thing that is actually
non-standard: RFC 9110 §9.3.1 gives content on a `GET` no defined semantics, and the Fetch spec
throws a `TypeError` if you pass a body with `GET`, so no browser can send one.

Four rules. Break one and it stops being a read.

1. **No side effects.** The method is a transport decision. If the handler cannot be run twice with
   identical results, it is not this pattern.
2. **A sub-resource, never an overload.** `POST /products` creates; `POST /products/search` asks.
   Never one URL doing both depending on the body's shape.
3. **Mount `/search` before `/:id`.** Express matches in mount order, so a `/:id`-shaped route
   registered first matches the literal string `search` as an id. `src/modules/products/routes.ts`
   is the reference. This applies to any static segment beside a wildcard — `GET
/products/categories` has the same requirement, and the frontend's response-schema map has the
   mirror of it.
4. **Not browser-cacheable — server-cacheable only.** The wire says `Cache-Control: no-store`;
   Redis caches it anyway, keyed server-side. `setCache` refuses `browserRevalidate` on a `POST`
   rather than ignoring it, and a `POST` is served from cache **only** when the route declares
   `keyAs` — without that requirement the next `POST` route to mount `setCache` would be cached by
   accident, a write included.

### Cache identity — the part worth copying

The two spellings ask one question, so they share one cache entry: `GET /products?text=x` warms
`POST /products/search {text}` and vice versa. Both routes declare the same `keyAs`, which replaces
the default `METHOD:path` prefix — the thing that otherwise separates them, since they differ in
**both** halves of it.

```ts
setCache(3600, {
    tags: ['products'],
    keyParameters: searchProductsKeyParameters,
    keyAs: 'products:search'
});
```

Three properties make sharing correct rather than merely clever:

| Property                       | Why it is load-bearing                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Key built from `keyParameters` | An allowlist. Keying on the whole body would let any caller mint unbounded entries with fields the endpoint never reads.          |
| Values normalised              | A query string carries `1` as `'1'`; a JSON body keeps the number. Without normalisation the two spellings never meet.            |
| Body read **before** query     | The `search` surface's own precedence. A key that disagreed with the controller would answer a request it was not about to serve. |

`tests/unit/infrastructure/http/middlewares/cache.test.ts` pins all three.

### The checklist, when one does qualify

Eight touch points:

1. `src/modules/<name>/openapi.yaml` — the operation, `x-alias-of` naming its `GET` twin
2. `shared/contracts/openapi.root.yaml` — the path `$ref` (**forget this and the bundler silently drops the route**)
3. `src/modules/<name>/routes.ts` — mount above any wildcard, with the shared `setCache`
4. the controller — usually unchanged; `surface: 'list'` becomes `surface: 'search'`
5. `src/modules/<name>/tests/contract/` — both spellings, including the shared pagination bounds
6. frontend `src/modules/<name>/response-schemas.ts` — one row
7. frontend `tests/unit/infrastructure/http/response-schema-map.spec.ts` — one row in `ROUTES`
8. `CHANGELOG.md`, then `npm run contracts:bundle` and `npm run sync:frontend`

Steps 6 and 7 are the ones that bite: **the backend gate stays fully green while the frontend goes
red.** `check:spec-identity` proves the two `openapi.yaml` copies are byte-identical, which says
nothing about whether the frontend has acted on what the contract now declares.

### Carried to another API

- Keep it a **sub-resource** (`/search`), so the URL alone says which operation it is.
- Keep it **side-effect free**, or the method stops being a lie you can defend.
- Declare `no-store` on the wire and cache server-side if you cache at all.
- If you cache both spellings, key from a **declared allowlist** and normalise values, or you have
  built a cache-poisoning surface rather than a cache.
- Name which spelling is canonical. This API uses `x-alias-of`; the mechanism matters less than
  answering the question.

---

## Current state, per module

Counts are the query parameters each list endpoint declares, pagination included.

### Has both spellings — nothing to do

| Resource | Query form      | Body form               | Filters |
| -------- | --------------- | ----------------------- | ------- |
| products | `GET /products` | `POST /products/search` | 8       |
| users    | `GET /users`    | `POST /users/search`    | 7       |
| orders   | `GET /orders`   | `POST /orders/search`   | 6       |
| feedback | `GET /feedback` | `POST /feedback/search` | 5       |

All four now share one cache entry per resource (`keyAs`), so the alternate spelling costs no
extra Mongo work.

`cart` also has both spellings of its two mutations already — `POST /cart` ↔ `PUT /cart/{productId}`
for add/edit, `DELETE /cart` ↔ `DELETE /cart/{productId}` for remove.

### Query-only lists — candidates, ranked

| Endpoint                        | Filters                                        | Verdict                                                                                                                             |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /observability/audit`      | `actor,action,outcome,since,page,pageSize` — 6 | **Most likely to need it.** Audit filters grow: add a date range, an id list, a target type and it is past the threshold. Watch it. |
| `GET /locales/{locale}/entries` | `page,pageSize,text,tenant` — 4                | **Second.** The only one with real free-text search, and the editing screen is the natural place for a saved-filter UI.             |
| `GET /inventory/movements`      | `page,pageSize,productId,reason` — 4           | **No, not yet.** Would only qualify if `productId` became a list.                                                                   |
| `GET /inventory/levels`         | `page,pageSize,lowOnly` — 3                    | **No.** Three parameters, one of them a boolean.                                                                                    |

**Action today: none.** All four declare `surface: 'list'`, which is honest about what they accept.
Revisit when a filter set crosses the threshold above.

### Write and delete spellings

`products`, `users` and `orders` each offer three delete spellings and two write spellings. No
other module does, and that is mostly correct:

| Module              | Missing                                          | Verdict                                                                                                                                                                           |
| ------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wishlist`          | collection `DELETE`, `PUT /wishlist/{productId}` | **No.** A saved line has no soft-delete and no editable field — there is no `hardDelete` to spell three ways and no update to route two ways.                                     |
| `cart`              | —                                                | Already has both spellings where it has a choice.                                                                                                                                 |
| `feedback`          | collection `PUT`, any `DELETE`                   | **No on `PUT`.** A single admin screen edits one ticket by id. **Separately worth asking:** feedback has no delete at all, which is a retention question, not a polymorphism one. |
| `locales`           | `/hard` path, body-id delete                     | **No.** A locale delete is already destructive with no soft tier.                                                                                                                 |
| `account/addresses` | collection `PUT`/`DELETE` with id in body        | **No.** The caller owns exactly one address book and always has the id in hand.                                                                                                   |

---

## Review — the duplicated filter set

A resource with both spellings describes one filter set in **two places** in the contract: a
`parameters` list on the `GET`, and a request schema on the `POST`. That produces four generated
types per resource:

```ts
ListProductsParams; // TS,  from GET query parameters
ListProductsQueryParams; // zod, from GET query parameters
SearchProductsRequest; // TS,  from POST request body
SearchProductsBody; // zod, from POST request body
```

**This duplication cannot be removed.** They are different operations, orval names types per
operation, and the two live in structurally different parts of the document. `$ref`ing one shared
schema from both makes the _source_ single without collapsing the generated names.

### It had already drifted

Comparing all four pairs on 2026-08-23 found one:

| Filter   | `GET /feedback`       | `POST /feedback/search`      |
| -------- | --------------------- | ---------------------------- |
| `status` | `type: string` — open | enum of four values — closed |

One filter, documented as unconstrained on one route and constrained on the other. Nobody wrote
that deliberately; a constraint added to a request schema is simply not added to a `parameters`
entry, because they are not the same lines.

**Fixed.** The closed set is now one `FeedbackRequestStatus` schema, `$ref`d from all five places
that had been spelling it out (or omitting it). The other three pairs already agreed.

The NAME was the interesting part. `FeedbackStatus` is the tidier choice and would have been a
silent breaking change: orval had already derived `FeedbackRequestStatus` from the inline copy on
`FeedbackRequest.status`, and the paired frontend imports it in five places. Naming the extracted
component after the type that already existed means the generated diff is pure deletion — two
orval-invented duplicates (`SearchFeedbackRequestsRequestStatus`,
`UpdateFeedbackRequestStatusRequestStatus`) disappear and nothing is renamed.

**The rule that falls out:** when extracting a shared schema, name it after the type the generator
already produced for one of its copies. A generated name is part of the contract even though
nobody wrote it.

**Guarded.** `tests/cross-cutting/contract-search-parity.test.ts` compares the validation shape of
every filter across both spellings — type, enum, bounds, length, pattern — and fails on a filter
present in one and missing from the other. It discovers pairs by walking `x-alias-of`, so a new
search sibling is covered without editing the test. It deliberately ignores `description` (prose
may differ) and `default` (a query string and a body need not agree about absence;
`normalizePagination` owns defaults for both).

### What this means for the trigger rule

The real cost of a second spelling is not the row in the cost table at the top of this file — it is
**paying attention to two declarations of one thing, forever.** The parity test collects that
payment automatically, which lowers the cost but does not remove it: a filter still has to be added
twice, correctly, in two shapes.

That strengthens rather than weakens the trigger rule. Add the sibling when the filter set has
outgrown a URL; do not add it because a neighbouring resource has one.

### Related finding — decided, and the earlier reading of it was wrong

An earlier draft of this file claimed both spellings **silently ignore** an unrecognised `status`
and return the unfiltered list. They do not, and nothing needs changing.

`search` sets the scope key whenever `filters.status` is truthy, so a bogus value produces
`{ status: undefined }` — which matches no document. The filter narrows to nothing, which is the
direction that is safe. `src/modules/feedback/tests/unit/service.test.ts` has asserted exactly this
all along, in two cases: an unknown status and the removed uppercase aliases both return zero
items.

So `?status=bogus` is not a filter that looks like it worked; it is a filter that worked and
matched nothing. That is Disposition 2 above, and it is why a read here does **not** answer `422`
the way `?pageSize=500` does: pagination has a correct value to clamp toward and therefore a lie
to refuse, while an unparseable enum has no members to return.

---

## The delete flag — closed

Was the one open defect in this file. Contradictory sources used to be resolved by rank, so the
answer depended on which transport a `false` happened to ride:

```
DELETE /users/{id}/hard              body {"hardDelete": false}  →  destroyed
DELETE /users/{id}?hardDelete=false  body {"hardDelete": true}   →  soft-deleted
```

Two spellings of one contradiction, answered two different ways.

**Resolved by OR, not by `409`.** Refusing a contradiction was the other candidate and was
rejected: it makes a client that sends a defensive `hardDelete: false` alongside the `/hard` path
form fail, when what it asked for is unambiguous. Under Disposition 1 both lines above now destroy
the record, because in each one a source said `true`. Nothing else about the delete surface moved:
`?hardDelete=false` alone still soft-deletes, an absent flag still soft-deletes, and
`?hardDelete=maybe` still answers `422` — including when another source says `true`.

The spec prose changed with it. `DELETE /products`, `/users` and `/orders` each said "the query
wins if both are sent", and the shared `HardDeleteParam` said nothing; all four now state the OR
rule. `openapi.yaml` and `api/` are regenerated.

---

## What NOT to do

- **Do not make "all three transports everywhere" a rule.** A `GET` cannot carry a body — the
  Fetch spec refuses to send one. `DELETE /cart/{productId}` cannot carry a body id — the route
  cannot match without the segment. Declaring an unreachable source is the exact bug the Closed
  list in `docs/theory/request-input.md` records seven times.
- **Do not declare a request body on a GET to get a generated type.** You already have one; see
  the appendix.
- **Do not use `deprecated: true`** to mark an alternate spelling. It is not deprecated, and orval
  emits deprecation warnings for it in the paired frontend. `x-alias-of` is the annotation, and
  `tests/cross-cutting/contract-aliases.test.ts` enforces it.

---

## Appendix — a GET already generates types

A recurring reason for declaring a body on a GET is "so I can import the type." It is unnecessary:
orval generates a named TypeScript type **and** a named zod schema from `in: query` parameters
alone.

`GET /products`, from its query parameters:

```ts
import type { ListProductsParams } from '@api/models'; // api/models/listProductsParams.ts
import { ListProductsQueryParams } from '@api/schemas.zod'; // api/schemas.zod.ts
```

`POST /products/search`, from its request body:

```ts
import type { SearchProductsRequest } from '@api/models'; // api/models/searchProductsRequest.ts
import { SearchProductsBody } from '@api/schemas.zod'; // api/schemas.zod.ts
```

Fifteen `*Params` models exist today. The naming is the only thing to learn:

| Declared as          | TypeScript type | Zod schema     |
| -------------------- | --------------- | -------------- |
| `parameters` (query) | `XParams`       | `XQueryParams` |
| `requestBody`        | `XRequest`      | `XBody`        |

The genuine asymmetry — four types for one filter set — is real, and is reviewed above under
[Review — the duplicated filter set](#review--the-duplicated-filter-set). It is an argument for
having fewer `/search` siblings, not for declaring bodies on GETs.
