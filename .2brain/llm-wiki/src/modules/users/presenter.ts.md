---
source: src/modules/users/presenter.ts
sha256: 83e318a0a9772014d0bbb5b49102717fd12aaecb125de42b2c60ca19aac2e793
generated_at: 2026-11-14T22:24:28.706764+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/presenter.ts

## Purpose

Pure mapping layer that turns a stored `UserWire` document into the three API contract shapes (`Account`, `User`, `UserListItem`). It is the single point where a persisted account becomes a wire-ready object; it contains no business logic, no lookups, and no side effects—only field selection, `Date → ISO string` conversion, and the one permitted PII decryption (phone).

## Key elements

- **`presentAccount(document, role)`** — Returns the self-service `Account` shape (e.g. `/account`, signup confirmation). Includes shared fields plus version stamp; no `actions`, no staff-only flags.
- **`presentUser(document, role, actions)`** — Returns the staff-facing `User` shape. Adds the caller-assembled `actions` block, `purgeAt`, and `purchaseHoldFlaggedAt` on top of shared fields.
- **`presentUserListItem(document, role, actions)`** — Returns the lean `UserListItem` row for the staff list table. Omits phone, website, pending email; represents a hold only as a boolean `purchaseHeld` flag. **Does not decrypt any PII.**
- **`sharedFields(document, role)`** *(internal)* — Assembles the common field set for `presentAccount` and `presentUser`. The sole call site for `decryptPii` (phone). ISO-stringifies all `Date` fields.
- **`presentPurchaseHold(document)`** *(internal)* — Emits the `purchaseHold` detail object only when `activeHoldOf` returns a live hold; omits the setter's identity (audited elsewhere).

## Relationships

- **`src/infrastructure/persistence/versioning.ts`** — `carryVersion` wraps the return of `presentAccount` and `presentUser` to stamp the persistence version onto the response.
- **`src/infrastructure/security/pii-encryption.ts`** — `decryptPii` is called inside `sharedFields` to decrypt the stored phone value before it reaches the wire.
- **`src/modules/users/model.ts`** — Provides the `UserWire` type and the `phoneAad` helper (AAD for the phone decryption). The presenter imports from here but, per the "persistence wall" convention, controllers never import `./model` directly.
- **`src/modules/users/services/purchase-hold.ts`** — Provides `activeHoldOf`, used by `presentPurchaseHold` and `presentUserListItem` to decide whether a hold is still in force.
- **`src/modules/users/services/index.ts` / `src/modules/users/services/read.ts`** — The service layer that calls `presentAccount` / `presentUser` / `presentUserListItem` and assembles the `actions` argument. Controllers receive the shaped result through this service boundary.
- **`src/modules/users/friends/account.ts`** — Downstream consumer in the account module that relies on this presenter (via the service) to shape its responses.
- **`src/types/index.ts`** — Source of the `Account`, `User`, `UserActions`, and `UserListItem` contract types that shape the output.
- **`src/modules/users/tests/integration/service.test.ts`** — Integration tests that exercise the presenter output through the service.

## Notes

- **One decryption site.** `decryptPii` appears only in `sharedFields`. `presentUserListItem` deliberately never decrypts—keep it that way when adding fields to the list row.
- **`role` is always caller-supplied.** The document carries no role of its own; the caller reads it from the membership store and passes it in. `null` omits the field entirely (same pattern as every optional field).
- **`actions` is pre-assembled.** This file only spreads it in; the rules that decide what a caller may do live in `./services/actions`. Don't add conditional action logic here.
- **Pure / no side effects.** Safe to call multiple times with the same input; no caches, no I/O, no `new Date()` beyond the `activeHoldOf` boundary check (which is itself a pure comparison).
- **`UserWire` over `UserDocument`.** The parameter type is the lean wire shape so that both hydrated documents and `search()`-normalized rows satisfy it without pulling in document methods.
