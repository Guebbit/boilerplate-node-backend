# src/modules/account/probes.ts

## Purpose

Exports a set of hand-written HTTP "probe" requests that exercise negative paths (401, 403, 409, 429) the account API's OpenAPI contract cannot declare. Because a contract only describes valid calls and their declared responses, there is no home inside it for requests whose purpose is to prove the API *rejects* something. These probes are appended to every generated client collection after the contract-derived requests.

## Key elements

- **`probes: Probe[]`** — The sole export. An array of four `Probe` objects (type from `@guebbit/openapi-runnable-collections`):
  - *Log in as the non-admin* — `POST /account/login` with `{{seedUserEmail}}` / `{{seedUserPassword}}`; verifies role-scoped 403s.
  - *401 with a bogus token* — `GET /account` with a fake Bearer token; confirms the 401 error envelope.
  - *409 on duplicate signup* — `POST /account/signup` reusing `{{seedAdminEmail}}`; triggers the "already exists" path.
  - *Rate-limit probe* — `POST /account/login` with a deliberately wrong password, meant to be sent in a burst to elicit a 429.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — This is the generator that *emits* the probes. It declares the seed-token vocabulary (`{{seedAdminEmail}}`, `{{seedUserPassword}}`, etc.). If a probe references a token not in that vocabulary, the generator fails and prints the list of known tokens. The probes array is appended after the contract-derived requests in the final collection.

## Notes

- Seed values are **always** referenced as `{{seedToken}}` placeholders, never hardcoded. A probe that pastes a literal email or password would drift from the dataset and defeats the token check.
- The rate-limit probe is intentionally a *wrong* password; the 429 response comes from auth middleware, not from any contract operation, which is why it lives here rather than in the contract.
- Each probe carries a `why` string — it is documentation for the collection consumer, not a comment. Keep it if you edit the probe.
