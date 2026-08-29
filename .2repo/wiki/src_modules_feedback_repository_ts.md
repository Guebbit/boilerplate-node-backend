# src/modules/feedback/repository.ts

## Purpose

Thin repository layer for `FeedbackRequest` documents. It delegates all CRUD logic to the shared base-repository factory, supplying only the module-specific model, transform, and search configuration. This keeps the feedback module free of raw query code while giving the service a standard repository interface.

## Key elements

- **`feedbackRequestRepository`** (exported const) — The only export. Created by `createBaseRepository<FeedbackRequestDocument>` with:
  - **Model:** `feedbackRequestModel` (from `./model`).
  - **Transform:** `applyFeedbackRequestTransform` — applied to query results before they reach callers.
  - **`searchable` spec:**
    - `objectIds` — matches `id` against `_id`.
    - `regex` — matches `email` as a regex pattern.
    - `text` — full-text search across `name`, `email`, `subject`, `message`.

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** — Provides the `createBaseRepository` factory that this file calls. All CRUD and search mechanics live there; this file only configures it.
- **`src/modules/feedback/model.ts`** — Supplies `feedbackRequestModel`, `applyFeedbackRequestTransform`, and the `FeedbackRequestDocument` type used as the generic parameter.
- **`src/modules/feedback/service.ts`** — Consumes `feedbackRequestRepository` for persistence operations. The JSDoc explicitly notes that the service is responsible for mapping a raw `status` string to the closed enum *before* passing a scope down to this repository.
- **Tests** (`service.test.ts`, `model.test.ts`, `schema-contract.test.ts`) — Exercise this repository indirectly through the service and directly through model/schema contracts.

## Notes

- **`status` is intentionally absent from the `searchable` spec.** It is a closed enum, and the raw-string → enum mapping is a domain decision owned by the service layer. Do not add `status` to the search config here; handle it upstream.
- The file contains no logic beyond configuration — if you need to change query behaviour, look at `base-repository.ts` or adjust the `searchable` object.
