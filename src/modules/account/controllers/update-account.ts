/**
 * @module
 * Controllers for `PUT /account` (replace) and `PATCH /account` (merge) — AUDIT_0924 D17d, built
 * on the shared `createUpdateController` factory. Both act on the CALLER's own record: there is
 * no id anywhere in the request, only `request.authContext.id` (see `idFrom` below).
 *
 * A changed email's side effects (the pending-change notice, the fresh verification link) are
 * `accountService.updateProfile`'s own business — see docs/modules/account.md#proving-an-address
 * — not this controller's.
 */

import { callerContextOf } from '@infrastructure/http/request';
import { readUploadedImage } from '@infrastructure/http/uploads';
import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceAccountBody, UpdateAccountBody } from '@api/schemas.zod';
import { accountService } from '../services';
import { userService } from '@modules/users';

/**
 * What `accountService.updateProfile` resolves to — named here rather than importing the
 * `users` module's document type, which `local/no-persistence-imports` keeps out of a
 * controller.
 */
type UpdateResult = Awaited<ReturnType<typeof accountService.updateProfile>>;

// `analyticsConsent` is excluded here, the same reasoning DM1 (DECISION_MADE.md) gives for
// `password` on the users resource: it is optional-but-not-nullable on both schemas — a plain
// flag a caller flips with an explicit `false`, never a field this profile's PUT representation
// can "clear" — so it must never be auto-filled with `null` by `fillOmittedWithNull`.
const writableFields = Object.keys(ReplaceAccountBody.shape).filter(
    (field) => field !== 'analyticsConsent'
);

/**
 * `PUT /account` and `PATCH /account` — one handler pair over `accountService.updateProfile`,
 * which already merges fields, routes `email` through the `pendingEmail` flow, and self-audits
 * (`AUTH_PROFILE_UPDATED` — see DM2, DECISION_MADE.md, for why this factory is never told an
 * `auditAction` here).
 *
 * `imageUrl` precedence (DM1): a resolved upload always wins over whatever the JSON body — or a
 * PUT's fill-omitted-with-null step — said about `imageUrl`. A multipart PUT/PATCH carries no
 * `imageUrl` key in its parsed body at all (multer already stripped the file field out), so on a
 * PUT the factory fills that gap with `null`; without this override a genuine new upload would be
 * silently cleared the instant it landed.
 */
export const { replace: replaceAccount, patch: patchAccount } = createUpdateController({
    entity: 'account',
    replaceSchema: ReplaceAccountBody,
    patchSchema: UpdateAccountBody,
    writableFields,
    // Guaranteed present: every mount behind this factory runs after `isAuth` — see
    // `UpdateControllerSpec.idFrom`'s own docblock (DM3, DECISION_MADE.md).
    idFrom: (request) => request.authContext!.id,
    update: (id, changes, request) => {
        const {
            imageUrl: uploadedImageUrl,
            thumbnailUrl,
            pendingImageKey,
            deleteUpload
        } = readUploadedImage(request);
        const imageUrl = uploadedImageUrl === undefined ? changes.imageUrl : uploadedImageUrl;

        // Named and explicitly typed rather than inline in the `.then()` below — a bare arrow
        // there, mixing a sync return (`result`) with an async one
        // (`deleteUpload().then(...)`), sends TypeScript's `.then()`/`.catch()` overload
        // resolution down the wrong path, rejecting every valid branch. A named function checked
        // as a whole against its own declared return type sidesteps that.
        const cleanUpThenReturn = (result: UpdateResult): Promise<UpdateResult> =>
            // An upload this request wrote must not survive a refused update, or the file is
            // orphaned with nothing referencing it.
            result.success
                ? Promise.resolve(result)
                : deleteUpload()
                      .catch(() => undefined)
                      .then(() => result);

        return accountService
            .updateProfile(
                id,
                { ...changes, imageUrl, thumbnailUrl, pendingImageKey },
                callerContextOf(request)
            )
            .then(cleanUpThenReturn)
            .catch((error: unknown) =>
                deleteUpload()
                    .catch(() => undefined)
                    .then((): never => {
                        throw error;
                    })
            );
    },
    // The role comes straight off the already-resolved auth context, same as `get-account.ts` —
    // a profile edit never changes it, so no second lookup here.
    present: (user, request) => userService.toUser(user, request.authContext!.roles.tenant),
    notFoundKey: 'account.update.not-found'
});
