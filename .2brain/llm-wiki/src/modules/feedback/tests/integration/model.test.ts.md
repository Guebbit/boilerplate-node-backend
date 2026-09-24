---
source: src/modules/feedback/tests/integration/model.test.ts
sha256: fae8aa06c91c0d23a1858e92620c308c624ff02c3398a31aa5c00acbd044c5b9
generated_at: 2026-09-23T18:41:48.778950+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/model.test.ts

## Purpose

Integration test that enforces the serialization contract for feedback requests: the internal MongoDB fields `_id` and `__v` must never appear in a consumer-facing payload, whether the data arrives as a hydrated Mongoose document (`toJSON`) or as a `.lean()` list mapped through the service layer.

## Key elements

- **`createFeedback`** – local helper that inserts a feedback record via `feedbackRequestRepository.create` and returns the resulting Mongoose document.
- **`describe('feedback request serialization')`** – the single test suite containing two cases:
    - _normalizes a hydrated document via toJSON_ – calls `feedback.toJSON()` on a real document and asserts `id` is present while `_id`/`__v` are absent from the JSON string.
    - _normalizes a lean list via feedbackRequestService.search_ – calls the service's `search({})`, grabs the first item, and asserts `id` matches a 24-char hex string while `_id` and `__v` are `undefined`.

## Relationships

- **`src/modules/feedback/repository.ts`** – provides `feedbackRequestRepository.create` used to seed test data.
- **`src/modules/feedback/service.ts`** – provides `feedbackRequestService.search`, the public entry point whose output shape is under test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module scope to attach the test/in-memory database before any test runs.
- **`tests/support/stub.ts`** – `asStub<Record<string, unknown>>` is used purely as a type assertion to read arbitrary keys off the lean result object in the second test.

## Notes

- `setupTestDb()` executes at import time (top-level), not inside a `beforeAll` hook; the file must be loaded after the test runner initializes.
- The `toJSON` test uses `JSON.stringify(json).not.toContain('_id')` rather than checking `json._id === undefined`, guarding against the key being present with an `undefined` value (which `JSON.stringify` would omit but a property check could miss if the key existed as `undefined`).
- `asStub` here is a type-level cast only — it does not replace or mock the object; the assertions run against the real lean document.
