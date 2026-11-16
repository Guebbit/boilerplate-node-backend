/**
 * @module
 * Controllers for `PUT /account` (replace) and `PATCH /account` (merge), built on the shared
 * `createUpdateController` factory. Both act on the CALLER's own record: there is no id anywhere
 * in the request, only `request.authContext.id` (see `idFrom` below).
 *
 * The email is not a field here: it starts at `POST /account/email-change`, see
 * docs/modules/account.md#proving-an-address.
 */

import { callerContextOf } from '@infrastructure/http/request';
import { writeWithUploadedImage } from '@infrastructure/http/uploads';
import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceAccountBody, UpdateAccountBody } from '@api/schemas.zod';
import { accountService } from '../services';
import { accountUserService } from '@modules/users/friends/account';
import { wellFormedLocale } from '@infrastructure/http/schemas';

/**
 * `PUT /account` and `PATCH /account` — one handler pair over `accountService.updateProfile`,
 * which merges the fields and audits the change itself. `email` is not one of them: the schemas
 * refuse it, and it moves only through `POST /account/email-change`.
 */
export const { replace: replaceAccount, update: updateAccount } = createUpdateController({
    versioned: true,
    entity: 'account',
    replaceSchema: ReplaceAccountBody.extend({
        locale: wellFormedLocale(ReplaceAccountBody.shape.locale)
    }),
    patchSchema: UpdateAccountBody.extend({
        locale: wellFormedLocale(UpdateAccountBody.shape.locale)
    }),
    // The one boolean an edit carrying an avatar (multipart) sends as a string.
    input: { booleans: ['analyticsConsent'] },
    // A client cannot send the current avatar back, so a PUT that omits it keeps it.
    keptWhenOmitted: ['imageUrl'],
    // Guaranteed present: every mount of these handlers runs after `isAuth`.
    idFrom: (request) => request.authContext!.id,
    update: (id, changes, request) =>
        writeWithUploadedImage(request, changes.imageUrl, (image) =>
            accountService.updateProfile(id, { ...changes, ...image }, callerContextOf(request))
        ),
    /**
     * The role comes straight off the already-resolved auth context, same as `get-account.ts` —
     * a profile edit never changes it, so no second lookup here.
     */
    present: (user, request) =>
        accountUserService.toAccount(user, request.authContext!.roles.tenant)
});
