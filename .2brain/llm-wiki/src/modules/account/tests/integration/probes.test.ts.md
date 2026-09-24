---
source: src/modules/account/tests/integration/probes.test.ts
sha256: dba8db063ea87cbe85165f07351368afaf442c176534cd949645ba7e078b9bc4
generated_at: 2026-09-23T18:13:57.144584+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/probes.test.ts

## Purpose

Integration test that verifies each HTTP probe defined in `account/probes.ts` actually returns the status code its own name claims (e.g. a probe named *"Probe: 409 on a signup that already exists"* must genuinely yield 409). It exists so the probe definitions shipped in generated API-client collections are machine-checked against the running app rather than trusted by their description alone.

## Key elements

- **`claimedStatus(name)`** – extracts the 3-digit status code embedded in a probe's name via regex; throws if no status is present.
- **`probeByName(name)`** – looks up a probe by exact `name` in the `probes` array; throws a descriptive error if the name no longer matches (guards against silent renames).
- **`it('401 with a bogus token')`** – issues a GET with a fake `Bearer` token and asserts the response status equals the claimed 401.
- **`it('409 on a signup that already exists')`** – seeds a user via the users factory, then POSTs a signup body with the same email and asserts the response status equals the claimed 409.

## Relationships

- **`src/modules/account/probes.ts`** – sole source of probe definitions (`name`, `path`, `body`); this test consumes that array directly.
- **`src/modules/users/tests/factories.ts`** – provides `createUser` and `PLAIN_PASSWORD` to seed the conflicting account for the 409 case.
- **`tests/support/http.ts`** – provides the `api()` HTTP client used to issue the probe requests.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb()` for database isolation before the suite runs.

## Notes

- Probes are matched by **exact string** on `name`. Renaming a probe in `probes.ts` will fail this file with a clear "has account/probes.ts been renamed?" error—intentional, but it means the two files must stay in lockstep.
- The `{{seedToken}}` placeholders that the full scenario dataset (`scenarios/subjects.ts`) would normally resolve are **manually substituted** here with equivalent seeded rows; this test deliberately avoids applying the full scenario to keep setup minimal.
- `claimedStatus` enforces a naming convention: every probe name **must** contain a standalone 3-digit number, or the test throws at runtime.
