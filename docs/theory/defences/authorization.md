# Authorization

Proving what you may do. The most common class in modern APIs, and the one scanners are worst at:
authentication was fine, the caller is exactly who they say they are, and the check on **this
object** or **this function** was simply missing.

Two questions, and they fail differently:

| Question                | Missing it gives you                         | Where it is answered here               |
| ----------------------- | -------------------------------------------- | --------------------------------------- |
| May you call this?      | function-level holes — BFLA, forced browsing | a `requirePermission` key on the route  |
| May you touch THIS one? | object-level holes — IDOR, tenant bleed      | an owner clause compiled INTO the query |

## Object-level: whose row is it

The rule this codebase follows: **a caller's own resource is looked up scoped to their id, never
fetched by id and checked afterwards.** The difference matters because the second shape leaks
existence through timing and error codes even when it refuses correctly.

| Attack                                         | How it works                                               | This boilerplate                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insecure direct object reference (IDOR) / BOLA | change the id in the URL or body; no ownership check       | The owner clause rides IN the read, compiled from the caller's own rules — `orders/repository.ts#findByIdScoped` and the equivalent per module, built by `kernel/access/query.ts#accessibleFilter`                                                                        |
| Horizontal privilege escalation                | same role, another user's data or actions                  | Same answer — a scoped read cannot return a peer's row, so there is no second check to forget.                                                                                                                                                                            |
| Vertical privilege escalation                  | admin endpoints reachable without the admin check          | Every write route is authenticated AND behind a `requirePermission` key unless it is listed, with a reason, in `WRITE_EXCEPTIONS` — `tests/cross-cutting/write-routes-are-guarded.test.ts`                                                                                |
| Broken object-property-level authorization     | over-fetching on read; mass assignment on write            | Write: the strict schemas — see [Mass assignment](injection.md#into-a-path-or-a-model). Read: each module serialises through its own shape rather than returning the document.                                                                                            |
| Tenant isolation failure                       | missing tenant scope on queries, shared caches, shared ids | The filter is compiled, not appended: a caller with no id produces a filter that matches NOTHING, never one that is absent — `kernel/access/query.ts#accessibleFilter`. The response cache is keyed by caller and locale too — see [Data layer](data-layer.md#the-cache). |
| Insecure direct file access                    | uploads under a public directory with predictable names    | 128 bits of randomness in the stored name is what makes another user's upload unguessable, and `index: false` removes the listing that would make guessing unnecessary — `app/static-assets.ts`                                                                           |
| GraphQL field-level authorization              | nested fields or aliases skip the top-level guard          | No surface: REST only.                                                                                                                                                                                                                                                    |

## Function-level: may you call this at all

One app-wide assertion rather than twelve local ones. The cross-cutting test enumerates the
**effective** route table from the mounted routers, so a route nobody wrote a suite for is still
covered, and a thirteenth module inherits the guarantee instead of opting into it.

| Attack                                     | How it works                                     | This boilerplate                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broken function-level authorization (BFLA) | the route exists, the middleware is missing      | The assertion above — `tests/cross-cutting/write-routes-are-guarded.test.ts`, `authorization-conformance.test.ts`                                                          |
| Forced browsing                            | guessing `/admin`, `/export`, `/v1/internal`     | Same test. Routes are mounted from each module's own manifest, so the route table and the module list cannot drift — `app/routes.ts`, `kernel/registry.ts`                 |
| Admin functionality in client bundle       | the UI hides a button, the server still answers  | The guard is on the route, and the test enumerates routes rather than UI. What the frontend renders is irrelevant to what this API accepts.                                |
| Missing rate limit on sensitive functions  | export, invite, coupon generation without quotas | `POST /account/export` answers the caller's OWN data and requires a fresh session; staff listings page at 100 rows — `account/routes.ts`, `infrastructure/http/schemas.ts` |

## Trusting something the client controls

| Attack                                | How it works                                      | This boilerplate                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parameter tampering                   | `role=admin` or `userId=…` in the body, trusted   | The buyer is `authContext.id`, never a body field. Naming someone else's address refuses the checkout before anything is written — `cart/services/checkout.ts`, `account/services/addresses.ts` |
| Referer / origin-based access control | a spoofable header used as authorization          | No surface: no guard reads `Referer`. CORS uses the origin allowlist for what the BROWSER may read, which is not an authorization decision — `app/security.ts`                                  |
| IP-based trust                        | `X-Forwarded-For` honoured from untrusted proxies | No guard is IP-based. `trust proxy` is a HOP COUNT from `NODE_TRUST_PROXY_HOPS`, never `true`, so even the rate limiter counts back from the forgeable end — `app/security.ts`                  |

## Bypassing the check rather than passing it

| Attack                               | How it works                                                          | This boilerplate                                                                                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path normalisation bypass            | `/Admin`, `/admin/`, `/admin%2f`, `/admin;x`, `..;/`, double encoding | The guard is not a path prefix match — it is middleware mounted on the route itself, so it runs whatever spelling reached the router. There is no separate "protected paths" list to disagree with the router.                                        |
| HTTP verb tampering                  | `GET` guarded, `HEAD`/`PUT`/`OPTIONS` not; method-override headers    | Guards are mounted per method on each route. No method-override middleware is installed, so `X-HTTP-Method-Override` and `_method` are inert.                                                                                                         |
| Time-of-check / time-of-use (TOCTOU) | the check passes, the state changes, the action runs                  | Conditional writes rather than read-then-write: `updateStatusIfIn` re-asserts the precondition INSIDE the write, so a stale read cannot land a change — `orders/repository.ts#updateStatusIfIn`. See [Business logic](business-logic.md#concurrency). |
| Confused deputy                      | an internal service trusts callers; SSRF into an admin API            | There is no internal-trust tier: the same guards run for every caller. And there is no SSRF primitive to reach one with — see [SSRF](ssrf.md).                                                                                                        |
| Reverse-proxy path confusion         | proxy and app normalise paths differently                             | See [HTTP and caches](http-and-caches.md#headers-and-the-proxy) — this repo is one Node process, and the proxy's rules are the deployment's.                                                                                                          |

## Order and state

Some authorization is not about identity at all: it is about whether this transition is legal from
where the object currently is.

| Attack                               | How it works                                              | This boilerplate                                                                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-step / workflow bypass         | the pay step skipped by calling confirm directly          | `POST /cart/checkout` and `POST /payments/:id/confirm` both sit behind `requireFreshAuth(REAUTH_TIME_CRITICAL)`, so the money steps cannot be reached with a merely-valid session — `cart/routes.ts`, `payments/routes.ts`       |
| State-machine violations             | cancel after shipped, refund twice                        | `ORDER_LIFECYCLE` is a TOTAL map from status to the moves it permits AND the actor each belongs to, so "cancel after shipped" and "a customer marking their own order paid" are both absent edges — `orders/domain/lifecycle.ts` |
| Context-dependent authorization gaps | "owner can edit", but the owner check reads a stale value | The owner clause is compiled from the verified token at request time, not carried in the document being edited.                                                                                                                  |

## Related

- [Authentication](authentication.md) — establishing the identity these checks read
- [Business logic](business-logic.md) — where the state machine above actually lives
- [Data layer](data-layer.md) — the query the owner clause is compiled into
- [The API surface](api-surface.md) — the route inventory these guards are asserted against
- [Authorization (theory)](../authorization.md) — how the permission keys and roles are designed
