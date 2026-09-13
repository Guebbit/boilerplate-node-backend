# The API surface

REST, GraphQL and webhooks. Most of the OWASP API Top 10 lives on other pages — object-level
authorization is [Authorization](authorization.md), resource consumption is
[Denial of service](denial-of-service.md), SSRF is [SSRF](ssrf.md). What is left is the family of
flaws that only make sense **because there is an API**: routes nobody remembers, parsers nobody
chose, and data arriving from a partner you trusted once.

The organising idea here: the OpenAPI contract is not documentation of the API, it **is** the API.
Routes, schemas, the typed client and the Zod validators are all generated from it, so a route
that is not in the contract does not exist and a field the contract never declared is refused.

## Which routes exist

The zombie-endpoint problem is a bookkeeping problem, and bookkeeping done by hand always drifts.

| Attack                        | How it works                                                      | This boilerplate                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Improper inventory management | shadow, zombie and old-version endpoints without the newer checks | Routes are mounted from each module's own manifest, so the route table and the module list cannot drift — `app/routes.ts`, `kernel/registry.ts`                                                                                         |
| Version downgrade             | `/v1/` still routable after `/v2/` fixed something                | No surface: there is one unversioned API, so there is no older version still routable.                                                                                                                                                  |
| Insecure API gateway rules    | the gateway's path rules differ from the upstream's               | No gateway in this repo. The guards are middleware on the route itself, not a path-prefix rule an intermediary could interpret differently — see [Authorization](authorization.md#bypassing-the-check-rather-than-passing-it).          |
| Forced browsing               | guessing an unprotected URL                                       | Same answer as [Function-level](authorization.md#function-level-may-you-call-this-at-all) — the cross-cutting test enumerates the EFFECTIVE route table from the mounted routers, so a route nobody wrote a suite for is still covered. |

## Shapes and parsers

The attacker's best move against a typed API is to make it choose a different type.

| Attack                        | How it works                                          | This boilerplate                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Content negotiation confusion | XML accepted where JSON was expected → XXE            | Express is given exactly three parsers — JSON, urlencoded, multipart — so there is no XML branch to negotiate into — `app/security.ts`           |
| Content-type sniffing         | `text/plain` parsed as JSON to avoid a CORS preflight | A body is parsed only by the parser its declared content type selects, and every one of the three is bounded. There is no "guess the type" path. |
| Mass assignment on write      | an undeclared field lands on the model                | Every body schema is `.strict()` — see [Injection](injection.md#into-a-path-or-a-model).                                                         |

## Bulk access and quotas

| Attack                             | How it works                                            | This boilerplate                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bulk / export endpoints            | one call returns everything, with no quota              | `POST /account/export` answers the caller's OWN data and requires a fresh session; staff listings page at 100 rows, with `page` capped too — `account/routes.ts`, `infrastructure/http/schemas.ts` |
| Missing rate limits per key / user | quotas absent or IP-only                                | The global brake is per address; `credentialLimiters` adds a per-ACCOUNT budget on the credential routes specifically — `infrastructure/http/middlewares/rate-limit.ts`                            |
| API key leakage                    | a key in client code, a mobile bundle, or a public repo | The one static credential is `NODE_METRICS_TOKEN`, compared with `timingSafeEqual` and DENIED by default when unset — `rate-limit.ts#isMetricsScraper`                                             |

## Consuming, and being consumed

| Attack                              | How it works                                                    | This boilerplate                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsafe consumption of upstream APIs | no validation of a partner's response; SSRF via their redirects | An OAuth provider's profile response is read for a FIXED set of fields, and an unverified email is refused rather than trusted — `account/oauth/providers/`, `account/services/oauth.ts`                                                                                                                       |
| Webhook forgery                     | no signature, no timestamp, no replay protection                | An HMAC over `<timestamp>.<raw body>` compared in constant time, with a 300-second freshness window — and the RAW bytes preserved for that path alone, because `JSON.stringify(request.body)` is not what the sender signed — `payments/providers/webhook-signature.ts`, `payments/module.ts`'s `rawBodyPaths` |
| Webhook replay                      | a real event resent, with no idempotency on the receiver        | An event-id ledger where the INSERT is the check: a unique index refuses the second of two concurrent deliveries — `payments/repository.ts#claimWebhookEvent`. See [The payment provider](business-logic.md#the-payment-provider).                                                                             |

## GraphQL

No surface for any of it: this is a REST API and there is no schema to introspect, no alias to
batch and no resolver to reach around.

| Attack                           | How it works                          |
| -------------------------------- | ------------------------------------- |
| Introspection exposure           | introspection left on in production   |
| Batching brute force             | many operations in one request        |
| Alias / nesting abuse            | one query fans out into a DoS         |
| Field suggestions                | "Did you mean…" reveals hidden fields |
| Mutation without CSRF protection | GraphQL over GET or form-encoded      |

Listed rather than omitted, because "we do not have that" is a verdict and silence is not.

## What the contract buys, concretely

| Guarantee                           | Enforced by                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| A route exists in exactly one place | module manifests → `app/routes.ts`                                               |
| An undeclared body field is a 422   | `orval.config.ts#override.zod.strict.body`                                       |
| A declared error is actually thrown | `tests/cross-cutting/contract-error-declarations.test.ts`                        |
| The bundle matches its fragments    | `tests/cross-cutting/contract-bundles.test.ts`, `npm run check:contracts-bundle` |
| The spec survives hostile input     | the `fuzz` suite, generating from the contract itself                            |

## Related

- [Authorization](authorization.md) — the guards asserted against this route table
- [Denial of service](denial-of-service.md) — the resource-consumption half of the API Top 10
- [SSRF](ssrf.md) — the outbound half
- [Contract fragmentation](../../api/contract-fragmentation.md) — how the contract is assembled
