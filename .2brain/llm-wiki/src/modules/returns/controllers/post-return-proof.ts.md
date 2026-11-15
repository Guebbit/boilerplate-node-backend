---
source: src/modules/returns/controllers/post-return-proof.ts
sha256: 021b297f7af3cffb99d4bf6d36323ac984b6f939047506efa41562e5d91d1f17
generated_at: 2026-11-14T21:32:57.679515+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-proof.ts

## Purpose

HTTP controller for `POST /returns/:id/proof-of-sending`. A staff-facing endpoint that records the carrier's proof of sending against an approved return. Responds `200` with the return object (still in `approved` status), augmented with caller-specific actions.

## Key elements

- **`postReturnProof(request, response)`** — The sole export. Validates the `:id` route param, parses and validates the JSON body against the `RecordProofOfSendingBody` Zod schema, extracts the auth context, then delegates to `returnService.recordProofOfSending`. On success, serialises the result through `returnService.withActions` before sending a `200` response.
- **`recordProofOfSending` call** — Passes the parsed body with `sentAt` converted from a string to a `Date`, plus the result of `callerContextOf(request)`.
- **Error handling** — Service-level rejections are surfaced via `refused`; uncaught errors are forwarded to the client through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `catchAs`, `parseBody`, and `refused` for body validation, rejection mapping, and error catching.
- **`src/infrastructure/http/ids.ts`** — Imports `requireId` to extract and validate the `:id` route parameter.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to build the caller context passed to the service.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to shape the `200` JSON envelope.
- **`src/modules/returns/services/index.ts`** — Imports `returnService`; calls `.recordProofOfSending` and `.withActions`.
- **`src/modules/returns/routes.ts`** — Registers `postReturnProof` as the handler for the `POST /returns/:id/proof-of-sending` route.
- **`src/types/index.ts`** — Imports the `Return` type used as the generic parameter on `successResponse`.

## Notes

- `body.sentAt` is a string at the controller level and is explicitly converted to `new Date(body.sentAt)` before being handed to the service. The spread `{ ...body, sentAt: … }` means the original string field is overwritten.
- `request.authContext` is accessed with a non-null assertion (`!`); the code relies on the `isAuth` middleware having already populated it. There is no runtime guard in this file.
- The module JSDoc states the return *stays* `approved` after this call — this endpoint does not transition the return to a different status.
