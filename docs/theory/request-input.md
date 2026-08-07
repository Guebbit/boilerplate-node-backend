# Request Input

A value an endpoint needs may arrive as a route param, a query-string entry or a body field, and
the same endpoint often accepts more than one of those. That is deliberate: it lets a single
controller serve `GET /products?text=x` and `POST /products/search {"text":"x"}` without
duplicating the handler, which is what keeps long filter sets out of URLs.

What is _not_ deliberate is re-deriving the rules of that polymorphism at every call site. This
page is the single written statement of which sources each endpoint reads, in what order, and what
happens to the value on the way in.

## The table

Read "sources" left-to-right as precedence, highest first — this is exactly the `sources` array
each controller declares.

| Endpoint(s)                                                             | Parameter                                       | Sources (highest first) | Treatment                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------- | ----------------------- | ---------------------------------------------- |
| `GET /products`, `POST /products/search`                                | `id`                                            | body, query             | first non-empty wins                           |
|                                                                         | `category`, `tag`                               | body, query             | merged, then `coerceStringArray(...)[0]`       |
|                                                                         | `page`, `pageSize`                              | body, query             | merged, then the shared pagination schema      |
|                                                                         | `text`, `minPrice`, `maxPrice`                  | body, query             | merged, then Zod                               |
| `GET /users`, `POST /users/search`                                      | `id`                                            | body, query             | first non-empty wins                           |
|                                                                         | `active`                                        | body, query             | merged, then Zod `value === 'true'`            |
|                                                                         | `page`, `pageSize`, `text`, `email`, `username` | body, query             | merged, then Zod (pagination shared)           |
| `GET /orders`, `POST /orders/search`                                    | `id`                                            | body, query             | first non-empty wins                           |
|                                                                         | `userId`                                        | body, query             | merged; **ignored for non-admin callers**      |
|                                                                         | `page`, `pageSize`, `productId`, `email`        | body, query             | merged, then Zod (pagination shared)           |
| `DELETE /products`, `DELETE /products/:id`, `DELETE /products/:id/hard` | `id`                                            | params, body            | validated as an ObjectId, 422 on failure       |
|                                                                         | `hardDelete`                                    | params, query, body     | boolean; 422 for anything that is not one      |
| `DELETE /users`, `DELETE /users/:id`, `DELETE /users/:id/hard`          | `id`                                            | params, body            | validated as an ObjectId, 422 on failure       |
|                                                                         | `hardDelete`                                    | params, query, body     | boolean; 422 for anything that is not one      |
| `DELETE /orders`, `DELETE /orders/:id`                                  | `id`                                            | params, body            | validated as an ObjectId, 422 on failure       |
| `POST /products`, `PUT /products`, `PUT /products/:id`                  | `id`                                            | params, body            | first non-empty wins                           |
|                                                                         | `active`                                        | body                    | boolean; decoded only on `multipart/form-data` |
|                                                                         | `categories`, `tags`                            | body                    | string array; decoded only on multipart        |
|                                                                         | everything else                                 | body                    | untouched                                      |
| `POST /users`, `PUT /users`, `PUT /users/:id`                           | `id`                                            | params, body            | first non-empty wins                           |
|                                                                         | `admin`, `active`                               | body                    | boolean; decoded only on multipart             |
|                                                                         | everything else                                 | body                    | untouched                                      |
| `POST /cart`                                                            | `productId`, `quantity`                         | body                    | Zod, then `isValidObjectId`                    |
| `PUT /cart/:productId`                                                  | `productId`                                     | params, body            | first non-empty wins, then `isValidObjectId`   |
|                                                                         | `quantity`                                      | body                    | Zod                                            |
| `DELETE /cart/:productId`                                               | `productId`                                     | params, body            | first non-empty wins, then `isValidObjectId`   |
| `GET /feedback`                                                         | `page`, `pageSize`                              | body, query             | merged, then the shared pagination schema      |
|                                                                         | `text`, `email`, `status`                       | body, query             | merged, passed through as strings              |

Pagination has exactly two authorities, and they answer different questions. `@core/http/schemas`
owns the **bounds** — `openapi.yaml` declares `minimum: 1` / `maximum: 100`, and every one of the
four search endpoints answers 422 for anything outside that, `GET /feedback` included.
`normalizePagination` (`@repositories/search`) owns the **defaults** — page 1, ten per page, or
`NODE_SETTINGS_PAGINATION_PAGE_SIZE` — and it runs on every search, which is why a controller
leaves an unspecified page absent rather than filling it in. Neither clamps: an out-of-range
request is rejected, not quietly turned into a different request.

## The rules behind the table

**Precedence is a `||` chain over the declared sources.** An empty value falls through as if the
key were absent, so `?id=` on a route that also has a body `id` reads the body's. This is the one
place the migration to `readInput` unified two spellings that used to differ: `extractCustomId`
used `||` (empty falls through) while `extractAndValidateId` used `??` (empty wins). No endpoint's
declared contract distinguishes the two, and no test did either.

**Explicit `undefined` keys are dropped.** An object spread _keeps_ a key whose value is
`undefined`, and such a key handed to Mongoose becomes a `field: undefined` filter clause rather
than being ignored. The merge therefore does a second pass to remove them.

**Absent is not empty.** A field nobody sent comes back `undefined`, never `false` or `[]`. The
service layer assigns anything defined, so defaulting here would turn a partial update into a full
overwrite and silently wipe whatever the caller did not mention.

**Only the string transports are decoded.** A route param and a query entry are strings by
construction — `?active=false` is the _string_ `'false'`, which is truthy, and a repeated key is
what stands in for an array — so there is no type in them to destroy and a declared boolean coming
from either is always decoded. A body is decoded only when it is `multipart/form-data`, which has
the same problem for the same reason. A JSON body is passed through untouched, and that asymmetry
is load-bearing: coercing JSON too is how `{"active": "not-a-boolean"}` reached the validator as a
perfectly good `true` and answered 201 where the contract promises 422.
`tests/contract/request-contract.test.ts` is the guard.

**Decoding is not validation.** Whatever the decoder could not recognise is passed through
unchanged, so `?hardDelete=maybe` reaches a schema and answers 422 rather than being guessed at.
The schemas for the scalars more than one endpoint accepts live in `@core/http/schemas`.

## Declaring it

`readInput` (`@core/http/request`) takes the row of the table above as an argument:

```ts
const input = readInput(request, {
    // precedence, highest first — explicit, not implied by which helper was reached for
    sources: ['params', 'body', 'query'],
    ids: ['id'],
    booleans: ['active', 'hardDelete'],
    stringArrays: ['categories', 'tags']
});
```

- `sources` — which of `params`/`body`/`query` this route reads, highest precedence first. Every
  key found in any of them ends up on the result; the categories below only change how _specific_
  keys are resolved or typed.
- `ids` — scalar identifiers. A repeated key arrives as an array, so the first entry is taken, and
  the `||` chain above applies. Typed `string | undefined`; nothing is validated here.
- `booleans` / `stringArrays` — fields whose type survives a JSON body but not a string transport.
  Decoded per the rule above. Anything unrecognisable is passed through so the validator
  downstream rejects it rather than this layer inventing a value.

One route may also state a flag in its path rather than as a value. `DELETE /products/:id/hard`
means what `DELETE /products/:id?hardDelete=true` means; the `routeFlag('hardDelete')` middleware
(`@middlewares/route-flag`) writes it onto `request.params` so the controller keeps a single
declaration instead of growing a second entry point. Being a param, it also outranks a query entry
that contradicts it — the URL a caller aimed at is the more explicit statement of intent.

Two helpers deliberately stay outside `readInput`:

- `isValidObjectId` — an `id is string` type guard, which is a different job from extraction and
  earns its line at three cart call sites.
- `extractAndValidateId` — it _responds_ (422) as well as extracting. It is built on `readInput`
  internally.

## What is deliberately not done yet

`openapi.yaml` already states, per operation, where every parameter lives — `in: path`,
`in: query`, `requestBody`. That is the same information the declarations above carry by hand, so
generating them from the spec would make the discrepancies below _unwritable_: a controller could
not read a source the contract does not declare, because nobody would be writing the source list.

It is not done, and the order matters. Four things stand in the way, none fatal: one controller
serves several operations (`writeProducts` covers three operationIds with three different declared
bodies), so a generated per-operation declaration would have to be wired per route rather than
per controller; `booleans`/`stringArrays` derive from the _multipart_ schema variant, not the JSON
one; `GET /products` and `POST /products/search` are two operations deliberately sharing one
controller, so their declarations would need unioning; and orval generates clients and schemas,
not server-side input declarations, so this would be new machinery to own.

The cheaper first move is a **test**, not a generator: read `openapi.yaml`, read each route's
declaration, and assert the declared `sources` are a subset of what the spec allows. That closes
the "nothing verifies the controller agrees" gap in one file, needs no build step, and would have
caught every discrepancy below. If it stays green for a few months the declaration shape is
stable and codegen becomes mechanical; if it goes red often, that is the answer about whether the
shape was ready to generate.

## Known discrepancies

Found while writing the table, checked against `openapi.yaml`, and recorded here so the next
change to these endpoints starts from the truth.

1. **`GET /products` declares `productId` in the query, and the controller reads `id`.** The
   generated client sends `productId`; the controller ignores it. The body schema
   (`SearchProductsRequest`) says `id`, so `POST /products/search` works and the GET does not.
2. **`category` and `tag` are body-only in the spec** but the controller accepts them from the
   query too, on both `GET /products` and `POST /products/search`.
3. **`active`/`admin` are decoded on every write route,** but `UpdateUserRequest`,
   `UpdateUserByIdRequest` and their multipart variants declare neither. Only `CreateUserRequest`
   does. A `PUT /users` carrying `admin: true` is undeclared input that the controller happily
   validates and stores.
4. **The delete and cart-item routes accept body fields their path variants do not declare.**
   `DELETE /products/{id}`, `DELETE /users/{id}` and `DELETE /cart/{productId}` declare no request
   body in `openapi.yaml`, yet the controllers read `id`/`hardDelete`/`productId` from one if it is
   sent. Harmless today — the path param wins — but the spec and the code disagree.
5. **`GET /feedback` declares a JSON request body and no query parameters at all,** while the
   controller reads both. A GET with a body is unusual enough that the spec is probably what needs
   correcting.

### Closed

- **`hardDelete` treated presence as the switch,** so `DELETE /products/:id?hardDelete=false`
  permanently deleted the product — the query value is the string `'false'`, which is truthy —
  while the spec typed the parameter `boolean` with `default: false`. A caller could destroy data
  by explicitly asking not to. It is now decoded and validated as the boolean it always was, and
  an uninterpretable value answers 422 rather than defaulting to the destructive option.
- **Pagination was bounded on three endpoints and not on the fourth.** `?pageSize=500` answered
  422 on `GET /products`, `/users` and `/orders` and a silently clamped 200 on `GET /feedback`,
  and neither answer was written down anywhere. All four now share `@core/http/schemas`.
- **`request.params.id` was read by every list controller.** `GET /products/:id`,
  `GET /users/:id` and `GET /orders/:id` route to the _item_ controllers;
  `getProducts`/`getUsers`/`getOrders` are only ever mounted on the collection and on `/search`,
  so that source could never fire. Dropped from their declarations, because a declaration naming
  a source is a claim about the route.
- **`hardDelete` was read from a `request.params` no route supplied.** It is a real param now:
  `routeFlag` puts it there for the `/hard` path form.
- **Nine operations answered 422 without declaring it.** `GET /products`, `/users`, `/orders`,
  `/feedback` and five of the delete operations have returned 422 for as long as they have
  validated anything; `openapi.yaml` listed only 200/401/403/404/500. Now declared, which is what
  lets the contract suite assert those responses at all.
