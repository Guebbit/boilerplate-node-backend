---
source: src/modules/example/controllers/get-example.ts
source_sha256: fd2fc54ad6f8730965f25b781e2dced27a1f671df3a3045ee128375ed3a7f196
context_sha256: f21be42f9813553adfc436d66d7c6da757b8b689befca898b0960c4d3ab0cc5f
generated_at: 2026-11-22T05:07:08.621087+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/controllers/get-example.ts

## Purpose
Defines the read-one controller for `GET /examples/:id`. It is a single call to the shared item-controller factory, which owns the 404 behavior (an unknown id and a malformed id get the same response). The route sits above the auth gate because a published example is open to anyone.

## Key elements
- `getExample`: controller produced by `createItemController`, configured with:
  - `entity: 'example'`
  - `notFoundKey: 'example.not-found'`, the key for the not-found response
  - `fetch(id, request)`, which calls `exampleService.getById(id, callerContextOf(request))`

Per the doc comment, visibility is: a published example for anyone; the owner's own example; or any example for a caller with `display:Example`. The service enforces this, not the controller.

## Relationships
- `src/infrastructure/surfaces/create-item-controller.ts`: provides `createItemController`, which builds the handler and handles the not-found case.
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which derives the caller context from the request and passes it to the service.
- `src/modules/example/services/index.ts`: provides `exampleService`, whose `getById` does the lookup.
- `src/modules/example/routes.ts`: the route file that registers this controller for `GET /examples/:id`. The route registration itself is not visible in this file.

## Notes
- The controller holds no logic of its own. Changes to 404 handling belong in the shared factory.
- Because the route is mounted above the auth gate, the caller context may belong to an unauthenticated caller. Access rules are left to the service.
