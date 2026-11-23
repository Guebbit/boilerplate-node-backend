---
source: src/modules/account/controllers/update-account.ts
generated_at: 2026-11-22T03:28:01.981355+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/update-account.ts

## Purpose
Defines the HTTP controllers for `PUT /account` (replace) and `PATCH /account` (merge). Both act on the caller's own account: there is no id in the request, only `request.authContext.id`. The email is not editable here; it changes only through `POST /account/email-change`.

## Key elements
- `replaceAccount` / `updateAccount`: exports destructured from `createUpdateController(...)`, handling PUT and PATCH respectively.
- `replaceSchema` / `patchSchema`: `ReplaceAccountBody` and `UpdateAccountBody` from `@api/schemas.zod`, each with `locale` overridden by `wellFormedLocale(...)`.
- `input: { booleans: ['analyticsConsent'] }`: the one boolean sent as a string when an edit carries an avatar (multipart).
- `keptWhenOmitted: ['imageUrl']`: a PUT that omits the avatar keeps the current one, since clients cannot send it back.
- `idFrom`: returns `request.authContext!.id`.
- `update`: wraps `accountService.updateProfile(id, { ...changes, ...image }, callerContextOf(request))` in `writeWithUploadedImage`, which handles the uploaded image. `updateProfile` merges the fields and audits the change itself.
- `present`: maps the updated user with `accountUserService.toAccount(user, request.authContext!.roles.tenant)`.
- Factory options also set `versioned: true` and `entity: 'account'`.

## Relationships
- `src/infrastructure/surfaces/create-update-controller.ts`: provides the factory that builds both handlers.
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which supplies the caller context passed to the service.
- `src/infrastructure/http/uploads.ts`: provides `writeWithUploadedImage`.
- `src/infrastructure/http/schemas.ts`: provides `wellFormedLocale`.
- `src/modules/account/services/index.ts`: exports `accountService`, whose `updateProfile` performs the update.
- `src/modules/users/friends/account.ts`: exports `accountUserService`, whose `toAccount` builds the response.
- `src/modules/account/routes.ts`: mounts these handlers. They rely on every mount running after `isAuth`.

## Notes
- The `authContext!` non-null assertions are safe only because `isAuth` runs before these handlers.
- The role in the response comes from the already-resolved auth context, as in `get-account.ts`. A profile edit never changes it, so there is no second lookup.
- The schemas refuse `email`.
- The module doc comment points to `docs/modules/account.md#proving-an-address` for the email-change flow.
