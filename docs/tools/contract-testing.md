# Contract Testing (Response Shape)

The layer that answers: **does the wire response match `openapi.yaml`, exactly?** Not "does the business logic look right" (that's [Unit Testing](./unit-testing.md)) and not "is the right middleware mounted" (that's [Integration Testing](./integration-testing.md)) — specifically, does the _serialized JSON_ match the contract other services and the paired frontend are written against, including the fields that must **not** be there.

This is one half of "contract testing" in this codebase. The other half — does a _request_ the contract declares legal actually get accepted — is [Contract-Derived Request Data](./contract-request-data.md), a structurally different layer. This page is about responses.

## Tools

| Tool                                            | Role                                                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [orval](https://orval.dev/)                     | Generates one strict, format-checking Zod schema per operation **and** documented status (`Login200Response`, `Login422Response`, …) from `openapi.yaml` |
| [supertest](https://github.com/ladjs/supertest) | Same HTTP harness as [Integration Testing](./integration-testing.md)                                                                                     |

## Why Zod works here

A plain `schema.parse(response.body)` would not be enough on its own: Zod's `zod.object` silently _strips_ unknown keys by default, so a leaked `password` would pass, evidence deleted. Two `orval.config.ts` settings make the generated schemas the actual judge instead:

- `strict.response` emits `zod.strictObject`, so an undeclared field fails instead of vanishing.
- `generateEachHttpStatus` emits one schema per DOCUMENTED STATUS, not just the success one, so a 401 or a 422 body is judged against its own declared shape too.

`tests/support/response-contract.ts` is the judge built on those schemas; the frontend judges its own responses the same way (`boilerplate-vue-frontend/src/infrastructure/http/validate.ts`).

## Architecture

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 50, 'rankSpacing': 65}}}%%
flowchart TB
    Spec[("openapi.yaml")] --> Orval["orval --config orval.config.ts\napi/schemas.zod.ts"]
    Real["Real HTTP response\nvia supertest(app)"] --> Patch["tests/support/contract.ts\npatches supertest.Test.prototype.then"]
    Patch --> Capture["every response captured\nper test"]
    Capture --> Judge["assertResponseMatchesContract()\ntests/support/response-contract.ts"]
    Orval --> Judge
    Judge --> Check{"status + body match\nthe operation's own schema?"}
    Check -->|no| Fail["afterEach throws — names exactly\nwhich field/status is wrong"]
    Check -->|yes| Pass["test passes"]

    classDef spec fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef test fill:#ddd6fe,stroke:#7c3aed,color:#111827;
    classDef check fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef fail fill:#fee2e2,stroke:#dc2626,color:#111827;
    class Spec spec;
    class Orval,Real,Patch,Capture,Judge test;
    class Check,Pass check;
    class Fail fail;
```

## Patterns

Every file starts the same way — one import for its side effect, `setupTestDb()` for a real in-memory Mongo (most contract tests create real records through repositories or factories, then assert on what the route returns). Nothing else is needed: EVERY response the test receives over `api()` is captured and judged automatically, in a shared `afterEach` — including a setup login or seed write nobody thought to assert on directly.

```ts
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';

setupTestDb();

it('matches the contract for an unrestricted caller', async () => {
    const { bearer } = await authenticateAs('admin');
    const response = await api().get('/users').set('Authorization', bearer);

    expect(response.status).toBe(200);
});
```

Two recurring shapes across the per-module `api.contract.test.ts` files:

- **Role branches, both sides.** `orders`' suite asserts `GET /orders/{id}` for both an unrestricted caller and a scoped one — the suite exists specifically because those two branches once returned _different shapes_ (the scoped path aggregated computed totals in, the unscoped path did a plain `findById` and didn't), and nothing before this layer crossed HTTP to notice. `authenticateAs('admin' | 'user')` covers those two; `authenticateAsRole('editor')` and friends drive any other preset role through the same HTTP surface.
- **Credential-leak guards as explicit assertions, backed by the contract as the general case.** `users`' suite keeps a hand-written `assertNoCredentials()` (checks the serialized JSON for `password` and a password hash prefix) alongside the automatic contract check. The explicit check is a readable statement of intent; the contract check is what makes it general — `openapi.yaml`'s `User` schema declares `additionalProperties: false`, so _any_ undeclared field fails, not just the two named here.

Who is refused is not a module file's job. The authorization sweep (`tests/contract/authorization-contract.test.ts`) sends every route that mounts an identity guard a callerless request, and every guarded route a request as each tenant persona (the two audiences with no stored role, and every preset role, the administrator included), and holds the answer to the role file. `tests/cross-cutting/identity-guards-follow-the-spec.test.ts` holds the other half: that no route is missing the guard its `security` names, and no route locks what the spec calls open. A module's contract file therefore asserts a 401 or a 403 only when it checks more than the status: an error `code`, a row left untouched, a refusal that depends on the row (an owner is still refused, a stale session is asked to re-authenticate).

Every file still drives the 404 and 422 branches through the real route: the automatic check judges those against their OWN documented schema (`GetUsers404Response`, not the success one), so a `ValidationErrorResponse` that drifts from what's declared is exactly as much a contract break as a success response would be. A response that is a genuine, deliberate deviation — not a bug — opts out per call site with `excludeFromSpecCheck`, from `tests/support/contract.ts`.

```mermaid
flowchart LR
    spec["openapi.yaml: security per operation"] --> guards["identity-guards-follow-the-spec: the route mounts what the spec names"]
    routes["route table: guards and permission keys"] --> sweep["authorization-contract: every guard answers right over HTTP, per role"]
    routes --> guards
    roles["authorization-roles.yaml"] --> sweep
    sweep --> module["module contract file: only what checks more than the status"]
```

## File map

**A module's contract suite is co-located with the module**, one file per domain, so it is deleted
along with it. Only the specs that belong to no domain live centrally.

| Path                                                     | Contents                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `tests/support/contract.ts`                              | Patches `supertest` to capture every response and judge it in one `afterEach`; `excludeFromSpecCheck` is the opt-out            |
| `tests/support/response-contract.ts`                     | The judge itself: matches a response's method+path+status to its generated Zod schema and parses the body                       |
| `src/modules/<name>/tests/contract/api.contract.test.ts` | One per routed module. Everything under that module's `basePath`                                                                |
| `src/modules/users/tests/contract/…`                     | `/users` — the credential-leak guard, `assertNoCredentials()`                                                                   |
| `src/modules/orders/tests/contract/…`                    | `/orders` — the role-branch guard, unrestricted and scoped caller                                                               |
| `tests/contract/system.test.ts`                          | `/` — the one route that belongs to no module                                                                                   |
| `tests/contract/route-spec-parity.test.ts`               | Every mounted route is in the spec, and every spec operation is mounted                                                         |
| `tests/contract/request-contract.test.ts`                | The other half — see [Contract-Derived Request Data](./contract-request-data.md)                                                |
| `tests/support/http.ts`                                  | `api()`, `authenticateAs()`, `loginBearer()`, `bearerForCookie()` — shared with [Integration Testing](./integration-testing.md) |

## Both session modes

The suite runs under either `NODE_SESSION_MODE` (`npm run test:contract` is `jwt`, the default;
`npm run test:contract:cookie` is `cookie`), and CI runs both. So a contract test never reads
`data.token` straight off a login, nor calls `POST /account/refresh` to get a fresh bearer: both
are `jwt`-only. It asks for the credential in a way that works in either mode:

| Need                                            | Use                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A signed-in account, from `POST /account/login` | `authenticateAs()` or `loginBearer(email)`: `transport: "bearer"` makes `cookie` mode answer with a `ses_…` id |
| A bearer for a session a cookie names           | `bearerForCookie(cookie)`: a `ses_…` id is its own bearer, a refresh token is exchanged                        |
| A session that proved only what the test says   | `mintSession(userId, { amr })` (`account`'s `tests/factories.ts`): goes through the strategy                   |
| What a re-proof claimed (`amr`)                 | `claimedAmr(response, userId)` (`account`'s contract `support.ts`): the token's claim, or the row              |

A case that is about one mode's own machinery (refresh rotation, the origin check) lives in
`account`'s `session-modes.test.ts`, which names the mode it is about.

## Commands

| Command                        | Effect                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run test:contract`        | `tsx scripts/testing/run-suite.ts contract` — jest over `tests/contract` and every `src/modules/*/tests/contract`                                                              |
| `npm run test:contract:cookie` | the same suite with `NODE_SESSION_MODE=cookie`: every operation answers the spec when a session id in a cookie, not an access token, is what signs the caller in. CI runs both |

## Related pages

- [Testing](./testing-and-docs.md) — suite overview
- [Contract-Derived Request Data](./contract-request-data.md) — the request-shape mirror of this page
- [Integration Testing](./integration-testing.md) — same HTTP harness, asserts wiring instead of shape
- [OpenAPI Workflow](../api/openapi-workflow.md)
