---
source: src/modules/example/services/crud.ts
sha256: 7714c81b60ea545dccfba51f885d70584ffd5e1cf29c362315ec61807c490a79
generated_at: 2026-11-08T05:53:26.564404+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/crud.ts

## Purpose

The CRUD service for the example module. It implements create, read, search, update, and delete of `Example` documents, applying access scoping, body-length validation, presentation, translation, audit logging, and metrics. Status transitions are intentionally excluded (delegated to `./transition.ts`). Composed as the single service door by `./index.ts`; controllers and sibling modules call its exports.

## Key elements

- **`ExampleResult`** — Union type (`ResponseSuccess<Example> | ResponseReject`) representing every write response.
- **`scopeOf(context, action)`** — Compiles the caller's authorization keys into a repository filter fragment for a given action (`read` | `update` | `delete`). Returns `{}` for full access or a match-nothing filter for no access.
- **`bodyTooLong(body)`** — Validates a text field against the deployment's `NODE_EXAMPLE_BODY_MAX_LENGTH` ceiling; returns a 422 `ResponseReject` or `undefined`.
- **`create(payload, context)`** — Creates a draft owned by the caller. Checks auth, body length, persists via repository, increments `exampleCreatedTotal`, records audit, presents for caller, wraps in 201 success.
- **`publishedById(id)`** — Internal helper: fetches a single example filtered to `ExampleStatus.published`, presents it publicly. Returns `null` if absent.
- **`translatedOne(example)`** — Internal helper: applies field-level translations to a single example via `applyTranslations`.
- **`getById(id, context)`** — Reads one example scoped to the caller. Falls back to the published version if the scoped lookup yields nothing. Translates the result.
- **`search(filters, context)`** — Paginated, scoped search. Injects the caller's read scope plus an optional `status` filter. Resolves owner names, presents rows with available actions, applies translations.
- **`applyUpdate(example, changes, context)`** — Internal helper: diffs title/body for `auditChanges`, assigns trimmed values, saves, records audit, presents.
- **`updateById(id, changes, context)`** — Updates an example the caller may edit. Checks body length, finds via update scope, delegates to `applyUpdate`. Both PUT and PATCH funnel here.
- **`deleteLoaded(example, context)`** — Internal helper: deletes the document, removes the cover image via `imageStore`, records audit.
- **`removeById(id, context)`** — Deletes an example the caller may delete. Finds via delete scope, delegates to `deleteLoaded`.

## Relationships

- **`@kernel/access/query` (`accessibleFilterFor`)** — All read/update/delete operations delegate row-level authorization to this; no manual ownership checks in this file.
- **`@infrastructure/http/response`** — All responses are shaped through `generateSuccess` / `generateReject`; the `ResponseSuccess`/`ResponseReject` types define the return contract.
- **`@infrastructure/observability/audit` (`recordAudit`)** — Called after every successful write (create, update, delete) to log the action.
- **`@infrastructure/observability/audit-changes` (`auditChanges`)** — Produces a diff of changed fields, attached as `metadata` on the update audit entry.
- **`@infrastructure/adapters/image-store` (`imageStore`)** — Removes the cover image (`imageUrl`) when an example is deleted.
- **`@infrastructure/persistence/create-repository` (`toObjectId`)** — Converts the caller's user id to an ObjectId for the create payload.
- **`@infrastructure/persistence/search` (`PaginatedMeta`)** — Type for the pagination metadata returned by `search`.
- **`@kernel/translation` (`applyTranslations`)** — Applied to single examples and search result sets to overlay localized field values.
- **`@infrastructure/i18n` (`t`)** — Localized error messages (body-too-long, not-found).
- **`../audit` (`exampleAuditActions`)** — Enumerated action identifiers passed to `recordAudit`.
- **`../config` (`exampleConfig`)** — Supplies the environment-specific `NODE_EXAMPLE_BODY_MAX_LENGTH` ceiling.
- **`../domain` (`fitsBodyLength`, `initialExampleStatus`)** — Domain rules for body validation and the initial status assigned at creation.
- **`../metrics` (`exampleCreatedTotal`)** — Counter incremented on successful create.

## Notes

- **Status is not editable here.** The file explicitly excludes status changes; `./transition.ts` is the sole door for status moves. `updateById` will silently ignore any `status` field in the payload (it only assigns `title` and `body`).
- **Authorization is filter-based, not check-based.** A row the caller may not touch is indistinguishable from a non-existent row (404). There is no 403 path in this file.
- **`getById` has a two-stage lookup.** First it tries the caller-scoped query (any status); if that returns nothing it falls back to the published-by-id query. This means an anonymous caller can only see published examples, while an owner sees their own drafts.
- **Body-length ceiling is per-deployment.** The limit comes from `exampleConfig()` (environment), which may be stricter than the API contract's own ceiling.
- **`search` accepts `page`/`pageSize` as `string | number`** to tolerate raw query-string values before validation upstream.
- **Delete removes the cover image as a side effect** but does not handle rollback if `imageStore.remove` fails after the document is already deleted (no transaction visible).
