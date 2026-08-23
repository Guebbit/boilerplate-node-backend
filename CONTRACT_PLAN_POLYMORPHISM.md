# Contract plan — polymorphism

Where this API offers several spellings of one operation, where it does not, and what it would
cost to close each gap. Written 2026-08-23, after the `GET /feedback` body was removed and the
`list` surface was added.

**Read the theory first if you have not:** `docs/theory/request-input.md` explains _how_
multi-source input works (`readInput`, the surface table, the precedence rules). This file is the
_where and whether_ — a backlog with verdicts, not a description of the machinery.

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

## The one real defect still open

Not a missing spelling — a resolved contradiction.

```
DELETE /users/{id}/hard      with body {"hardDelete": false}   →  deletes permanently
DELETE /users/{id}?hardDelete=false  with body {"hardDelete": true}  →  soft-deletes
```

Precedence (`params > query > body`) silently picks a winner. For a read that is fine and
deliberate. For an **irreversible** operation, a request that says both "destroy" and "do not
destroy" is a client bug, and the honest answer is `409`, not a coin flip decided by transport.

The work: `hardDelete` is read once, in `createDeleteController`
(`src/infrastructure/http/delete-controller.ts`). Collect the value from each source _separately_
rather than through the merged `readInput` result, and refuse when two sources disagree. Roughly
one helper, one branch, and a contract test per delete route.

**This is the highest-value item in this file.** Everything else above is "not yet"; this one
destroys data today on a request that explicitly asked it not to.

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

**The genuine asymmetry** — and probably what prompted the question — is that a resource with both
spellings gets **four** types describing one filter set: `ListProductsParams`,
`ListProductsQueryParams`, `SearchProductsRequest`, `SearchProductsBody`. That duplication is real
and orval offers no way out of it: the query form and the body form are different operations, and
it names types per operation. `$ref`ing one shared schema from both makes the _source_ single
without collapsing the generated names.

That is an argument for having fewer `/search` siblings — the trigger rule at the top — not for
declaring bodies on GETs.
