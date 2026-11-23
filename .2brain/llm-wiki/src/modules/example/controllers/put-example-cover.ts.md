---
source: src/modules/example/controllers/put-example-cover.ts
generated_at: 2026-11-22T05:08:02.829216+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/controllers/put-example-cover.ts

## Purpose
Express controller for `PUT /examples/:id/cover`. It reads the image that the upload middleware left on the request and passes it to the example service to replace the example's cover. It serves as the module's upload-controller template, and the header says it can be deleted if the module has no upload (along with its cover service, the route and the contract path).

## Key elements
- `putExampleCover`: the exported handler, built with `namedHandler('putExampleCover', ...)`. It does the following:
  1. Validates the `:id` param with `requireId`, using the `example.not-found` message. If that fails, it returns without doing anything else.
  2. Reads `{ imageUrl, thumbnailUrl, pendingImageKey }` from `readUploadedImage(request)`.
  3. Responds `422` with `t('example.cover-missing')` if `imageUrl` is not a string.
  4. Calls `exampleService.setCover(id, { imageUrl, thumbnailUrl, pendingImageKey }, callerContextOf(request))`.
  5. If the result was refused, returns, because `refused(response, result)` has already handled the response. Otherwise it calls `claimUpload(request)` and sends `successResponse(response, result.data, 200)`.
  6. Passes any rejection to `catchAs(response, 'putExampleCover')`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `namedHandler`, `catchAs` and `refused`, which wrap the handler and handle service refusals and errors.
- `src/infrastructure/http/ids.ts`: `requireId` parses and validates the route id.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` and `rejectResponse` write the HTTP responses.
- `src/infrastructure/http/uploads.ts`: `readUploadedImage` reads the upload result from the request, and `claimUpload` marks the upload as kept.
- `src/infrastructure/i18n/index.ts` (`t`): localizes the `example.cover-missing` message. `src/infrastructure/i18n/context.ts` is listed as a neighbor, but the file does not use it directly.
- `src/modules/example/services/index.ts` (`exampleService`): `setCover` performs the actual cover update.
- `src/modules/example/routes.ts`: the route that wires this handler to `PUT /examples/:id/cover` (the header describes the route; the registration is not in this file).

## Notes
- Upload cleanup: the upload stays unclaimed unless the write succeeds. The upload middleware's close hook deletes uploads from requests that ended 4xx/5xx, so the controller does not need to delete them itself. `claimUpload` is called only after a non-refused result.
- There is no `If-Match` check, because the URL has no GET and an upload replaces the file whole.
- A body-only `imageUrl: null` cannot clear a cover. A missing file always gives a 422.
- The handler returns `Promise.resolve()` on its early exits so every path returns a Promise.
