# Contract plan — POST that reads

`POST /products/search` does not create a product. It is a **read wearing a write's method**,
because the question does not fit in a URL. This file states when that is legitimate, the rules
that keep it legitimate, and where else it may be applied — in this API and in any other.

Companion to `CONTRACT_PLAN_POLYMORPHISM.md`, which decides _which_ endpoints get one.

---

## Is it standard?

Yes. It is the recognised escape hatch for a query too large or too structured for a query string,
and it has broad prior art — Elasticsearch's `POST /_search`, GitHub's and Stripe's complex-query
endpoints. The pattern is not a compromise; the alternative (a body on a `GET`) is the thing that
is actually non-standard, and it does not work:

- **RFC 9110 §9.3.1** — content in a `GET` "has no generally defined semantics" and may cause
  implementations to reject the request.
- **The Fetch spec** throws a `TypeError` if you pass a body with `GET`, so no browser can send
  one. The paired frontend could never have used `GET /feedback`'s body, which is why it is gone.

---

## The four rules

A `POST` that reads is safe exactly when all four hold. Break one and it stops being a read.

### 1. No side effects

The method is a transport decision. Nothing is created, nothing is mutated, nothing is
audited-as-a-write. If the handler cannot be run twice with identical results, it is not this
pattern.

### 2. A sub-resource, never an overload

```
POST /products          →  creates a product
POST /products/search   →  asks a question
```

Never one URL doing both depending on the body's shape. `POST /products` is a write; the search
lives one segment deeper and is unambiguous from the URL alone.

### 3. Mount `/search` before `/:id`

Express matches in mount order, so a `/:id`-shaped route registered first will match the literal
string `search` as an id. Every router in this repo mounts the static segment first, with a
comment saying why. `src/modules/products/routes.ts` is the reference.

This applies to any static segment beside a wildcard, not just `search` — `GET /products/categories`
has the same requirement, and the frontend's response-schema map has the mirror of it.

### 4. Not browser-cacheable — server-cacheable only

RFC 9110 makes a `POST` response cacheable only under conditions this pattern does not meet, and
an intermediary that stored one would be free to answer a **later** `POST` from it — on some other
route, a real write. So:

- The wire says `Cache-Control: no-store`.
- Redis caches it anyway, keyed server-side.
- `setCache` refuses `browserRevalidate` on a `POST` rather than ignoring it — there is nothing for
  a browser to revalidate on a response it may not store.
- A `POST` is served from cache **only** when the route declares `keyAs`. Without that requirement
  the next `POST` route to mount `setCache` would be cached by accident, a write included.

---

## Cache identity — the part worth copying

The two spellings ask one question, so they share one cache entry. `GET /products?text=x` warms
`POST /products/search {text}` and vice versa. Both routes declare:

```ts
setCache(3600, {
    tags: ['products'],
    keyParameters: searchProductsKeyParameters,
    keyAs: 'products:search'
});
```

`keyAs` replaces the default `METHOD:path` prefix, which is what otherwise separates them — they
differ in **both** halves of it.

Three properties make sharing correct rather than merely clever:

| Property                       | Why it is load-bearing                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Key built from `keyParameters` | An allowlist. Keying on the whole body would let any caller mint unbounded entries with fields the endpoint never reads.          |
| Values normalised              | A query string carries `1` as `'1'`; a JSON body keeps the number. Without normalisation the two spellings never meet.            |
| Body read **before** query     | The `search` surface's own precedence. A key that disagreed with the controller would answer a request it was not about to serve. |

`tests/unit/infrastructure/http/middlewares/cache.test.ts` pins all three.

---

## Where else it applies in this API

Nowhere, today. The four resources that need it have it, and the four query-only lists are below
the threshold — see `CONTRACT_PLAN_POLYMORPHISM.md` for the ranked candidates and the trigger.

When one does qualify, the work is eight touch points:

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
nothing about whether the frontend has acted on what the contract now declares. Both rows are
needed — one validates the response envelope, the other asserts no row is silently covered by
another operation's wildcard.

---

## Applying it in another API

The rules above are not specific to this codebase. Carried to any REST service:

- Keep it a **sub-resource** (`/search`), so the URL alone says which operation it is.
- Keep it **side-effect free**, or the method stops being a lie you can defend.
- Declare `no-store` on the wire and cache server-side if you cache at all.
- If you cache both spellings, key from a **declared allowlist** and normalise values, or you have
  built a cache-poisoning surface rather than a cache.
- Name which spelling is canonical. This API uses `x-alias-of`; the mechanism matters less than
  answering the question, because "functionally equivalent to X" tells a client author the one
  thing they do not need to know.
