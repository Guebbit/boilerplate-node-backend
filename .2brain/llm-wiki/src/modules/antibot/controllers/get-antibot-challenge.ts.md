---
source: src/modules/antibot/controllers/get-antibot-challenge.ts
sha256: ad20f99272c993d688dd66450899a038c7c9037b7f530b5b1a78a24265aa9a47
generated_at: 2026-09-23T18:22:19.073053+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/controllers/get-antibot-challenge.ts

## Purpose

Controller for `GET /antibot/challenge`. It is the endpoint a self-hosted antibot provider's widget calls to fetch a challenge. Vendor-hosted providers obtain their challenge from the vendor and never reach this route.

## Key elements

- **`getAntibotChallenge`** (exported) — Express route handler. Resolves the active human-challenge provider, then either returns a `404` (code `ANTIBOT_NO_CHALLENGE`) if the provider has no `issueChallenge` method, or calls `issueChallenge()` and returns the resulting `AntibotChallenge` object in a success envelope.

## Relationships

- **`@infrastructure/adapters/antibot-providers`** — calls `resolveHumanChallengeProvider()` to obtain the currently configured provider instance.
- **`@infrastructure/http/response`** — uses `successResponse` to wrap the challenge payload and `rejectResponse` for the 404 case.
- **`@infrastructure/http/controller`** — uses `catchAs` to attach a standardized error handler to the promise chain.
- **`@infrastructure/i18n`** — calls `t('generic.error-antibot-no-challenge')` for the localized error message.
- **`@types`** — imports the `AntibotChallenge` type used as the generic on `successResponse`.
- **`src/modules/antibot/routes.ts`** — registers `getAntibotChallenge` as the handler for `GET /antibot/challenge`.

## Notes

- The `404` when the provider has no challenge is **by design**, not an error. It is a truthful response indicating this deployment has no self-hosted challenge to issue (e.g. provider is `none` or vendor-hosted).
- The request parameter is intentionally unused (prefixed `_request`); the handler only needs the response object.
- The async flow uses `.then`/`.catch` on a `Promise.resolve()` chain rather than `async/await`, consistent with the `catchAs` pattern used elsewhere in the codebase.
