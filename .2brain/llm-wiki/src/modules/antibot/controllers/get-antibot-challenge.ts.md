---
source: src/modules/antibot/controllers/get-antibot-challenge.ts
source_sha256: 8f468a35d203577aff0ec528429af8ebcbb0c7a54a33d9f83f98807138330fc0
context_sha256: 9ba5d13fc4a774e7837fc38d771a8935e10d87d81f71a8b85e1c53114a41f148
generated_at: 2026-11-22T04:19:07.258785+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/antibot/controllers/get-antibot-challenge.ts

## Purpose
Express controller for the public `GET /antibot/challenge` route. It is the endpoint a self-hosted antibot provider's widget calls to fetch a challenge (work to solve). Vendor-hosted providers supply their own challenges and never reach this route.

## Key elements
- `getAntibotChallenge(request, response)` — the sole export. Resolves the active human-challenge provider and, if it supports issuing challenges, returns the result as a success response typed `AntibotChallenge`.
  - If the provider has no `issueChallenge` method (the `none` provider or any vendor-hosted one), it responds `404` with error code `ERROR_CODES.ANTIBOT_NO_CHALLENGE` and the localized message `generic.error-antibot-no-challenge`.
  - Any thrown or rejected error is handled by `catchAs(response, 'getAntibotChallenge')`.

## Relationships
- `@infrastructure/adapters/antibot-providers` — `resolveHumanChallengeProvider()` selects the active provider; its optional `issueChallenge()` produces the challenge.
- `@infrastructure/http/response` — `successResponse` and `rejectResponse` build the HTTP replies.
- `@infrastructure/http/controller` — `catchAs` supplies the promise-chain error handler, labeled with the controller name.
- `@infrastructure/i18n` — `t()` localizes the 404 message.
- `@types` — provides the `AntibotChallenge` type.
- `src/modules/antibot/routes.ts` — the route module that wires this handler to `GET /antibot/challenge`.

## Notes
- The 404 is intentional: the code treats it as a truthful answer that this deployment has no challenge to fetch, not as an error condition.
- The handler is written as a promise chain starting from `Promise.resolve()`, so a synchronous throw from provider resolution is also routed to `catchAs`.
- The `_request` parameter is unused.
- The error code constant `ERROR_CODES.ANTIBOT_NO_CHALLENGE` is imported from `@api/error-codes`.
