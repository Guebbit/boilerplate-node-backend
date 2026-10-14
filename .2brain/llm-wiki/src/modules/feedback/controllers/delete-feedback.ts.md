---
source: src/modules/feedback/controllers/delete-feedback.ts
sha256: ecdacea9618d23092cea53eece8bb65650e8ba6c3f164b9c2c418beb4c2055ab
generated_at: 2026-10-14T15:48:41.500335+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/controllers/delete-feedback.ts

## Purpose

Controller for `DELETE /feedback/:id` (admin). Permanently removes a feedback ticket. It is hand-written rather than derived from the shared `createDeleteController` factory because that factory models a soft/hard delete triplet, and the feedback module has no soft-delete tier.

## Key elements

- **`deleteFeedback`** (default export) — Express route handler. Validates the `:id` param via `requireId`, calls `feedbackRequestService.remove(id, callerContextOf(request))`, then responds with 200 + message on success, a refusal (403-family) if the service returns a rejection, or a 404 for both malformed and unknown ids. Errors are funneled through `catchAs(response, 'deleteFeedback')`.

## Relationships

- **`../service`** (`feedbackRequestService`) — the domain service whose `.remove()` method performs the actual deletion.
- **`@infrastructure/http/ids`** — `requireId` extracts and validates the route param, returning a generic 404 on failure.
- **`@infrastructure/http/controller`** — `catchAs` provides the catch-handler wrapper; `refused` inspects the service result for an authorization/permission denial.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the authenticated caller identity for the service call.
- **`@infrastructure/http/response`** — `successResponse` builds the 200 JSON reply.
- **`../routes.ts`** — registers this handler on the `DELETE /feedback/:id` route.

## Notes

- Both a *malformed* id and a *non-existent* id produce the same 404 (`generic.error-not-found`) body — intentional, to avoid leaking whether a given id format is valid.
- The `if (!id) return Promise.resolve()` early-return after `requireId` means the response has already been sent by that helper; the `Promise.resolve()` simply satisfies the handler's return-type contract.
- Do not refactor this into `createDeleteController`; the factory assumes a soft-delete tier that does not exist here.
