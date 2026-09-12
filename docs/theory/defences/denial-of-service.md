# Denial of service

Availability. The only family where the attacker does not need a flaw at all — just an asymmetry
between what a request costs them and what it costs you. Every defence is therefore about
**bounding** something: how many, how big, how long, how deep.

Volumetric attacks are not this repo's layer, and saying so is the honest verdict rather than a
dodge: a Node process cannot absorb a botnet, and no application-level control changes that. What
this page covers is the second half — the requests that are cheap to send and expensive to serve.

## Volume

| Attack                     | How it works                                                  | This boilerplate                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Volumetric DDoS            | botnets; reflection and amplification via DNS, NTP, memcached | Not this layer — the edge's. Nothing this process does changes a saturated link; the recipe is [Edge rate limiting](../../tools/deployment-hardening.md#edge-rate-limiting-and-waf).                                    |
| Protocol DoS (L3/L4)       | SYN floods, fragmentation attacks                             | Same — the kernel's and the edge's.                                                                                                                                                                                     |
| Application-layer DoS (L7) | search, export and report endpoints hit repeatedly            | A global per-address burst brake, mounted before the request logger so a refusal is still recorded — `infrastructure/http/middlewares/rate-limit.ts`. Every 429 logs at `warn`, audited or not — `rate-limit.ts#refuse` |
| Retry storms               | clients amplify an outage by retrying without backoff         | Outbound work runs through the queue, which dead-letters rather than requeues a message that will not start matching — `infrastructure/adapters/queue.ts`                                                               |

**Why every limit is keyed on an IP address, and why that is a weak bound.** Residential proxy
pools cost about $20 for millions of addresses, and one IPv6 customer is handed 18 quintillion. So
these bound one person on one connection and bound almost nothing about someone actually trying.
The ladder that answers this properly is on
[Automation and abuse](automation-and-abuse.md#the-ladder).

## Expensive work from a cheap request

The asymmetry rows. Each one is a place where a few bytes of input buy a lot of CPU or memory.

| Attack                        | How it works                                               | This boilerplate                                                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ReDoS                         | nested quantifiers backtracking catastrophically           | `new RegExp` appears nowhere; search patterns come from `toSearchPattern`, which escapes every metacharacter — `infrastructure/persistence/search.ts`. The contract's own patterns are checked by `tests/cross-cutting/search-regex.test.ts`. |
| Unbounded queries             | one request scans everything — no pagination cap, `$where` | `findAll` applies a 1000-row backstop when no limit is named, and BOTH `page` and `pageSize` are capped at the contract layer, so deep paging cannot walk the collection either — `create-repository.ts`, `infrastructure/http/schemas.ts`    |
| Large request bodies          | no body-size limit; multipart floods                       | An explicit `limit` on `express.json()` and `express.urlencoded()` (`NODE_JSON_BODY_LIMIT`, 100kb) rather than trusting the library default, and `NODE_MAX_UPLOAD_BYTES` (5 MB) for multipart — `app/security.ts`                             |
| Algorithmic complexity        | hash-collision flooding, quadratic sorting, deep JSON      | The body limit bounds depth and size together: 100kb of JSON cannot nest deeply enough to matter.                                                                                                                                             |
| XML / zip / image bombs       | small input, huge expansion                                | `limitInputPixels` caps the DECODED pixel count at 50 M before any resize — see [Files](files-and-uploads.md#what-the-bytes-do-once-accepted).                                                                                                |
| Event-loop blocking           | synchronous CPU work or sync I/O in a request path         | The one genuinely CPU-bound operation — PDF rendering — runs through a worker, not the request path. See [Clustering](../clustering.md).                                                                                                      |
| GraphQL depth / breadth abuse | deep nesting, aliases, batching, circular fragments        | No surface: REST only.                                                                                                                                                                                                                        |

## Holding a resource

| Attack                       | How it works                                           | This boilerplate                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slow HTTP                    | Slowloris, slow POST, slow read hold connections open  | `headersTimeout` 15s and `requestTimeout` 120s — the one DoS the rate limiter cannot see, since it counts requests and these send a fraction of one per connection — `app/security.ts#applyServerTimeouts` |
| Connection / pool exhaustion | long transactions, held connections, missing timeouts  | The same receive-side timeouts free the socket; Mongoose's own pool settings bound the database side.                                                                                                      |
| Storage exhaustion           | unlimited uploads or log flooding fill the disk        | Per-file byte ceiling plus the dedicated `uploadLimiter` budget — `rate-limit.ts#uploadLimiter`. A global quota across all uploads is 🚧 coming soon.                                                      |
| Account lockout DoS          | the attacker locks victims out by guessing             | There is no lockout to trigger — see [Guessing the credential](authentication.md#guessing-the-credential).                                                                                                 |
| Cache stampede               | expiry makes every worker rebuild the same key at once | 🚧 Coming soon — see [HTTP and caches](http-and-caches.md#caches).                                                                                                                                         |

## Making the server do the work outward

The nastiest shape: the attacker spends one request, and your server spends money, reputation or
someone else's patience.

| Attack                        | How it works                                         | This boilerplate                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email / SMS bombing           | unlimited resend endpoints; SMS pumping (toll fraud) | `credentialLimiters` on `/reset`, `/verify-request` and the 2FA send route; `mfaSendLimiter` bounds outbound codes separately from guesses — `rate-limit.ts`. SMS pumping has no surface: there is no SMS factor. |
| Notification / webhook floods | user-triggered fan-out with no quota                 | No surface: nothing fans out to user-supplied destinations — see [SSRF](ssrf.md#making-the-server-fetch).                                                                                                         |
| Redirect / recursion loops    | self-referencing includes, redirect cycles           | No surface: no include loader, and no redirect target is caller-supplied.                                                                                                                                         |
| Third-party dependency outage | synchronous calls to non-essential services          | Analytics is fire-and-forget; the mailer and the queue fail the operation rather than hanging it.                                                                                                                 |

## What no rate limiter can bound

| Attack                          | How it works                                 | This boilerplate                                                                                     |
| ------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Resource-limit misconfiguration | one tenant starves others; no per-user quota | Budgets are per-address and per-identity, not global, so one caller cannot consume the whole budget. |
| HTTP/2 rapid reset              | cheap stream resets exhaust the server       | See [HTTP and caches](http-and-caches.md#cheap-request-expensive-server).                            |

## Related

- [HTTP and caches](http-and-caches.md) — the protocol half
- [Automation and abuse](automation-and-abuse.md) — the ladder past IP-keyed limits
- [Files and uploads](files-and-uploads.md) — bombs and storage
- [Runtime](runtime.md) — what happens when the process does fall over
