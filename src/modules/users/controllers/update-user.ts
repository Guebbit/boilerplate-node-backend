/**
 * @module
 * Controllers for `PUT /users/:id` (replace) and `PATCH /users/:id` (merge) — AUDIT_0924 D17d,
 * built on the shared `createUpdateController` factory.
 *
 * See: docs/modules/users.md
 */

import { callerContextOf } from '@infrastructure/http/request';
import { readUploadedImage } from '@infrastructure/http/uploads';
import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceUserByIdBody, PatchUserByIdBody } from '@api/schemas.zod';
import { userService } from '../service';

/**
 * What `userService.updateById` resolves to — named here rather than importing the model's own
 * document type, which `local/no-persistence-imports` keeps out of a controller.
 */
type UpdateResult = Awaited<ReturnType<typeof userService.updateById>>;

// `password` is excluded here (DM1, DECISION_MADE.md): it is optional-non-nullable on both
// schemas — omitted means "leave it unchanged" on every verb, never "clear it" — so a PUT that
// omits it must not have `fillOmittedWithNull` fill it with `null` and wipe the stored hash.
const writableFields = Object.keys(ReplaceUserByIdBody.shape).filter((field) => field !== 'password');

/**
 * `PUT /users/:id` and `PATCH /users/:id` — one handler pair over `userService.updateById`, which
 * already merges fields and self-audits (ban/unban split, deactivation analytics — see DM2,
 * DECISION_MADE.md, for why this factory is never told an `auditAction` here).
 *
 * `imageUrl` precedence (DM1): a resolved upload always wins over whatever the JSON body — or a
 * PUT's fill-omitted-with-null step — said about `imageUrl`. A multipart PUT/PATCH carries no
 * `imageUrl` key in its parsed body at all (multer already stripped the file field out), so on a
 * PUT the factory fills that gap with `null`; without this override a genuine new upload would be
 * silently cleared the instant it landed.
 */
export const { replace: replaceUser, patch: patchUser } = createUpdateController({
    entity: 'user',
    replaceSchema: ReplaceUserByIdBody,
    patchSchema: PatchUserByIdBody,
    writableFields,
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
        // (`deleteUpload().then(...)`), sent TypeScript's `.then()`/`.catch()` overload
        // resolution down the wrong path, rejecting every valid branch. A named function checked
        // as a whole against its own declared return type sidesteps that.
        const cleanUpThenReturn = (result: UpdateResult): Promise<UpdateResult> =>
            // An upload this request wrote must not survive a refused update, or the file is
            // orphaned with nothing referencing it — same cleanup `write-users.ts` used to run.
            result.success
                ? Promise.resolve(result)
                : deleteUpload()
                      .catch(() => undefined)
                      .then(() => result);

        return userService
            .updateById(
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
    present: (user) => userService.toUserContract(user),
    notFoundKey: 'users.not-found'
});
