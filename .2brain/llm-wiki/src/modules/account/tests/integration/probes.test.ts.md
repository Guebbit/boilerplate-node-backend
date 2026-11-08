---
source: src/modules/account/tests/integration/probes.test.ts
sha256: dba8db063ea87cbe85165f07351368afaf442c176534cd949645ba7e078b9bc4
generated_at: 2026-11-08T04:39:59.048594+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/probes.test.ts

## Purpose

Integration test that verifies each probe exported by `account/probes.ts` actually returns the HTTP status code stated in its own `name` field (e.g. a probe named "Probe: 409 on a signup…" must respond with 409). This guards against drift between the probe's self-description and the real app behaviour, replacing the "paste into Bruno and trust the label" workflow.

## Key elements

- **`claimedStatus(name: string)`** – Parses the first 3-digit number out of a probe's name and returns it as the expected status. Throws if no number is found.
- **`probeByName(name: string)`** – Looks up a probe in the `probes` array by exact name match; throws with a rename-hint if missing.
- **`describe` block** – Two test cases:
  - *401 with a bogus token* – Sends the probe's `path` with a fake Bearer token, asserts the response status equals `claimedStatus`.
  - *409 on a signup that already exists* – Seeds a user via `createUser`, then POSTs the probe's body (overriding email/password) and asserts 409.

## Relationships

- **`src/modules/account/probes.ts`** – Source of the `probes` array under test; each probe's `name`, `path`, and optional `body` are read directly.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser` (to pre-seed the "already exists" row) and `PLAIN_PASSWORD` (the known password for seeded users).
- **`tests/support/http.ts`** – Exposes the `api()` HTTP client helper used for all requests.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` resets/initialises the test database before the suite runs.

## Notes

- Only probes reproducible with local fixtures are covered. Probes that depend on `{{seedToken}}` placeholders resolving against the full `scenarios/subjects.ts` dataset are deliberately excluded—standing up a whole scenario for a single assertion is out of scope here.
- The test is coupled to probe naming: if a probe's name no longer contains a 3-digit status, `claimedStatus` throws. Renaming a probe without updating its name (or vice-versa) will break the lookup in `probeByName`.
- The 409 test overrides the probe's `body` email/password with the freshly seeded user's credentials rather than relying on the probe's placeholder values.
