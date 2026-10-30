---
source: src/modules/example/controllers/put-example-cover.ts
sha256: e2db3a390449db6fe4bbf31f2b5704724e11ac9eff4f9030cebc9f85ecadbfa6
generated_at: 2026-10-29T03:52:02.581319+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/put-example-cover.ts

## Purpose
Handles `PUT /examples/:id/cover`. It reads the image that the upload middleware attached to the request, validates that a file is actually present, and delegates the cover update to `exampleService.setCover`. It exists as the single HTTP entry-point for replacing an example's cover image.

## Key elements
- **`putExampleCover`** (exported) — a `namedHandler` wrapping the request logic:
  1. Extracts the `:id` param via `requireId`; returns early if missing.
  2. Reads `imageUrl`, `thumbnailUrl`, `pendingImageKey` off the request via `readUploadedImage`.
  3. Rejects with **422** if `imageUrl` is not a string (no uploaded file).
  4. Calls `exampleService.setCover(id, …, callerContextOf(request))`.
  5. On success: calls `claimUpload(request)` then sends **200** with `result.data`.
  6. On refusal/error: handled by `refused` / `catchAs`.

## Relationships
- **`src/infrastructure/http/controller.ts`** — provides `namedHandler` (wraps the handler with a name for tracing), `catchAs` (maps thrown errors to a structured error response), and `refused` (checks whether the service result signals a refusal and short-circuits).
- **`src/infrastructure/http/ids.ts`** — `requireId` validates and extracts the `:id` route parameter, responding 404 if absent.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` pulls caller/tenant context from the request to pass into the service call.
- **`src/infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` produce the standard JSON envelope for 200 and 422 respectively.
- **`src/infrastructure/http/uploads.ts`** — `readUploadedImage` retrieves the pre-processed image fields the upload middleware stored on the request; `claimUpload` marks the temporary upload as consumed so the close-hook does not delete it.
- **`src/infrastructure/i18n/index.ts`** (re-exports `t` from `context.ts`) — `t('example.cover-missing')` localizes the 422 error message.
- **`src/modules/example/services/index.ts`** — exports `exampleService`, whose `.setCover(id, payload, callerContext)` performs the actual persistence.
- **`src/modules/example/routes.ts`** — registers `putExampleCover` on the `PUT /examples/:id/cover` path.

## Notes
- **Claim-on-success pattern:** `claimUpload(request)` is called *only* after `setCover` resolves successfully. The upload middleware's close hook automatically deletes any upload whose request ends with a 4xx/5xx, so no explicit cleanup is needed in the error paths.
- **Body-only `imageUrl: null` is not a valid way to clear a cover.** The handler explicitly requires `typeof imageUrl === 'string'`; a missing/`null` value triggers 422. Use a different endpoint if "clear cover" semantics are needed.
- The file header documents that the entire file (plus `services/cover.ts`, the route entry, and the contract path) can be deleted together if the module no longer needs an upload.
