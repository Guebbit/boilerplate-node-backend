---
source: src/modules/account/controllers/post-email-change-confirm.ts
sha256: f2e7cd7252cef6233aa9936fd31180cba3db146437a71c22d9f1d7c62bd5b80c
generated_at: 2026-10-29T02:29:33.825899+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-confirm.ts

## Purpose

Controller for `POST /account/email-change/confirm`. It validates a one-time email-change token from the request body and, on success, promotes the caller's `pendingEmail` to the active `email`. The endpoint is intentionally public: the token itself is the credential, not a session or login.

## Key elements

- **`postEmailChangeConfirm`** (exported) — the only export. Express handler that:
  1. Parses the body with the shared `ConfirmEmailChangeBody` zod schema via `parseBody`.
  2. Calls `accountService.confirmEmailChange(token, callerContext)` to spend the token and swap the address.
  3. Returns **204 No Content** on success (`noContentResponse`).
  4. Emits `authEmailChangeConfirmTotal` (`success` / `failure`) on every terminal path.
  5. Routes errors through `catchAs`, which lets a unique-index conflict surface as a **409** rather than a blanket 500.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Supplies `parseBody`, `refused`, and `catchAs` — the three shared controller helpers used here. |
| `src/infrastructure/http/request.ts` | `callerContextOf(request)` extracts the authenticated caller identity for the service call. |
| `src/infrastructure/http/response.ts` | `noContentResponse` sends the 204 on the happy path. |
| `src/infrastructure/adapters/logger.ts` | Indirect dependency: `catchAs` delegates logging of the caught error to the app logger. |
| `src/modules/account/services/index.ts` | `accountService.confirmEmailChange` performs the actual token-spend + address-swap logic. |
| `src/modules/account/metrics.ts` | `authEmailChangeConfirmTotal` counter, incremented with `status: 'success'` or `'failure'`. |
| `src/modules/account/routes.ts` | Registers this handler on the `/account/email-change/confirm` route. |
| `src/types/index.ts` | Exports `VerifyEmailConfirmRequest` (the `{ token }` body type shared with the `verify-confirm` endpoint). |

## Notes

- **Type naming quirk.** The body type is imported as `VerifyEmailConfirmRequest` (not `EmailChangeConfirmRequest`) because orval generates a single type for the shared `{ token }` schema used by both the verify and confirm endpoints. This is intentional, not a copy-paste error.
- **Token cross-use is rejected.** A `verify` token must *not* succeed here and vice-versa; the service enforces that the two prove different things.
- **Error semantics are derived, not assumed.** `catchAs` inspects the thrown error to decide between a 409 (new address already claimed → unique-index violation) and a 500 (unexpected failure), logging whichever actually occurred.
- **No response body on success.** The endpoint returns 204 with no payload; the client learns success purely from the status code.
