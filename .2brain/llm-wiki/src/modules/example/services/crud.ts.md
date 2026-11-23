---
source: src/modules/example/services/crud.ts
source_sha256: 399d8ed6845314e25df871c9548e887c877758f5b7812e1a36bb7ddce588e3c7
context_sha256: 66da7aea6faedd045384667a1542a5e32c3b16d8158b72e481908d63cdeb957d
generated_at: 2026-11-22T05:12:08.619025+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/services/crud.ts

## Purpose
The service layer for the Example module's create, read, search, update and delete operations. It applies domain rules, talks to the repository, and announces outcomes (audit log, metric). Row visibility and editability are not hand-checked: the caller's keys are compiled into the query filter, so a row the caller may not touch is simply "not found". Status changes are deliberately excluded and live in `./transition.ts`.

## Key elements
- `create(payload, context)`: creates a draft owned by the caller. Returns 401 if the caller has no id, and 422 if the body is too long. Trims title and body, sets `initialExampleStatus`, increments `exampleCreatedTotal`, records `EXAMPLE_CREATED`, and returns 201.
- `getById(id, context)`: finds one example under the caller's `read` scope. If none is found, it falls back to a published example, which anyone can see. The result is translated. Returns `null` for a missing id or a draft the caller can't see.
- `search(filters, context)`: paginated search within the `read` scope. `status` is passed as a scope rather than a search field. Rows are presented with owner names and per-row actions, then translated. `page` and `pageSize` may still be strings.
- `updateById(id, changes, context)`: serves both PUT and PATCH. Returns 422 for an over-long body, and 404 if no row is found under the `update` scope. Otherwise it calls `applyUpdate`.
- `removeById(id, context)`: finds the row under the `delete` scope (404 if none), then calls `deleteLoaded`.
- Internal helpers:
  - `scopeOf`: wraps `accessibleFilterFor(caller, 'Example', action)`.
  - `bodyTooLong`: compares the body against `NODE_EXAMPLE_BODY_MAX_LENGTH` from `exampleConfig()`.
  - `publishedById`: looks up a published example by id.
  - `translatedOne`: applies translations to a single example.
  - `applyUpdate`: computes audit metadata, assigns the trimmed fields, saves, records `EXAMPLE_UPDATED`, and returns 200.
  - `deleteLoaded`: deletes the row, removes the cover image, records `EXAMPLE_DELETED`, and returns 200.

## Relationships
- **Access and scoping:** `@kernel/access/query` (`accessibleFilterFor`) supplies the per-action filter fragments.
- **Persistence:** `exampleRepository` (`../repository`) provides `create`, `findScoped`, `search`, `save` and `deleteOne`. `toObjectId` comes from `create-repository`, and the `PaginatedMeta` type from `persistence/search`.
- **Domain and config:** `../domain` provides `fitsBodyLength` and `initialExampleStatus`. `../config` provides the body-length ceiling.
- **Observability:** `recordAudit` and `auditChanges` are used with the action names from `../audit`. `exampleCreatedTotal` comes from `../metrics`.
- **HTTP responses:** `generateSuccess` and `generateReject` from `infrastructure/http/response` build the result objects.
- **i18n:** `t` from `@infrastructure/i18n` produces error messages. `applyTranslations` from `@kernel/translation` translates the returned text fields.
- **Image storage:** the `imageStore` adapter (`infrastructure/adapters/image-store`) is used to remove the cover image on delete.
- **Same-module helpers:** `presentExampleRow` (`../presenter`), `ownerNamesOf`, `presentForCaller` and `presentPublic` (`./owner`), and `actionsForRows` (`./actions`) shape the output.

## Notes
- Draft and missing are indistinguishable by design: a non-owner gets the same `null` or 404 for both.
- In `applyUpdate`, `auditChanges` runs before the field assignments so it can compare old and new values. The title and body are recorded by name only, not by value.
- `deleteLoaded` removes the image after the document is deleted. A failure in `imageStore.remove` would reject the chain, and no audit entry would be recorded.
- The deployment's body-length limit can be lower than the contract's own limit.
