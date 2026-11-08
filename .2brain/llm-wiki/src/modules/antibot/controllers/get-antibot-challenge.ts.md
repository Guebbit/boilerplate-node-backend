---
source: src/modules/antibot/controllers/get-antibot-challenge.ts
sha256: 8f468a35d203577aff0ec528429af8ebcbb0c7a54a33d9f83f98807138330fc0
generated_at: 2026-11-08T05:00:04.803734+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/controllers/get-antibot-challenge.ts

## Purpose

Controller for the public `GET /antibot/challenge` endpoint. It resolves the deployment's active self-hosted antibot provider and returns a challenge object for the provider's widget to consume. Vendor-hosted providers never call this route.

## Key elements

- **`getAntibotChallenge`** — exported Express handler `(Request, Response) => void`. Uses a `Promise.resolve().then()` chain (not `async/await`) to:
  1. Call `resolveHumanChallengeProvider()` to get the active provider.
  2. If the provider lacks `issueChallenge` (i.e. mode is `none` or a vendor-hosted provider), send a **404** with `ERROR_CODES.ANTIBOT_NO_CHALLENGE` and an i18n message.
  3. Otherwise call `provider.issueChallenge()` and wrap the result in `successResponse<AntibotChallenge>`.
  4. All failures are funnelled through `catchAs(response, 'getAntibotChallenge')`.

## Relationships

- **`@infrastructure/adapters/antibot-providers`** — calls `resolveHumanChallengeProvider()` to obtain the configured provider instance.
- **`@infrastructure/http/response`** — uses `successResponse` and `rejectResponse` to shape the HTTP reply.
- **`@infrastructure/http/controller`** — uses `catchAs` as the terminal error handler for the promise chain.
- **`@infrastructure/i18n`** — uses `t()` to translate the 404 error message.
- **`@types`** — imports the `AntibotChallenge` type for the success payload.
- **`@api/error-codes`** — imports `ERROR_CODES.ANTIBOT_NO_CHALLENGE` for the 404 body.
- **`src/modules/antibot/routes.ts`** — registers this handler on the `GET /antibot/challenge` route (public, no auth).

## Notes

- The 404 is **intentional and truthful**, not an error: it communicates "this deployment has no self-hosted challenge to serve." The response body still uses the structured error-code format.
- The `_request` parameter is unused (underscore-prefixed); the endpoint is stateless.
- Error handling relies entirely on `catchAs` — no explicit `try/catch`. Any thrown/rejected value in the chain is caught there and formatted as an HTTP error response.
