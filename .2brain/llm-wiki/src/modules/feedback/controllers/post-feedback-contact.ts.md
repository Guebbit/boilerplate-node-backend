---
source: src/modules/feedback/controllers/post-feedback-contact.ts
sha256: 22959053a15e826ff4aad666b20c39f5b52958f0a0ebcdb71127f76a45b4294e
generated_at: 2026-09-23T18:39:28.356951+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/controllers/post-feedback-contact.ts

## Purpose

Implements the sole public write endpoint in the feedback module — `POST /feedback/contact` — which creates a feedback ticket and (via the service) sends a support notification email. Mounted above the admin gate in `../routes` rather than exempted from it.

## Key elements

- **`createFeedbackSchema`** (module-level const, not exported) — Zod validation schema built by `.extend()`-ing the orval-generated `CreateFeedbackRequestBody`. Adds `.trim()`, `.min(1)`, and restates `.max()` limits (pulled from generated constants, not literal numbers). `name` is optional; `email`, `subject`, `message` are required.
- **`postFeedbackContact`** (exported) — Express handler. Validates the body with `parseBody`, delegates to `feedbackRequestService.create()`, responds `201` with the created record via `successResponse`. Errors funnel through `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — supplies `parseBody` (Zod parse + 400 on failure) and `catchAs` (maps thrown errors to a JSON error response, tagged with the handler name).
- **`@infrastructure/http/response`** — supplies `successResponse` for the well-formed `201` envelope.
- **`../routes`** — mounts `postFeedbackContact` on `POST /feedback/contact`, placed above the admin-gate middleware.
- **`../service`** — `feedbackRequestService.create(body)` performs the actual ticket creation and email notification; the controller only validates input and formats output.
- **`@types`** — provides the `CreateFeedbackRequest` (typed body) and `FeedbackRequest` (wire response shape) used in the handler signature and response cast.

## Notes

- `ZodSchema.extend()` **replaces** a field's schema; it does not merge. That's why each `.max()` limit is restated alongside `.trim()`/`.min(1)` — omitting the limit silently drops it.
- Length limits reference the generated constants (`createFeedbackRequestBodyNameMax`, etc.) so they stay in lockstep with `openapi.yaml` without hand-maintained magic numbers.
- The returned document is cast via `.toJSON()` because the stored Mongoose shape (`_id`, native dates) differs from the `FeedbackRequest` wire type (`id`, ISO strings). The cast is necessary but untyped.
- Email-recipient and language logic lives entirely in the service; the controller is deliberately agnostic about who gets notified.
