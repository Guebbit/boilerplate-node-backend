/**
 * @module
 * Controllers for `PUT /locales/:locale` (replace) and `PATCH /locales/:locale` (merge), built on
 * the shared `createUpdateController` factory. The tag is not editable — every entry references
 * it, so changing it would rename a whole dictionary — which is why it is read from the path,
 * never the body.
 */

import { z } from 'zod';
import { ReplaceLocaleBody, UpdateLocaleBody } from '@api/schemas.zod';
import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import type { Language } from '@types';

/**
 * A display name that survives being trimmed — see `create-locale.ts`'s own copy of this comment;
 * `minLength: 1` alone would let a Mongoose `required: true` column reject an all-whitespace name
 * with a generic 422 instead of this field-named one.
 */
const displayName = z.string().trim().min(1);

/**
 * `PUT` and `PATCH /locales/:locale` — one handler pair over `updateLanguage`, which audits the
 * change itself.
 */
export const { replace: replaceLocale, update: updateLocale } = createUpdateController({
    entity: 'locale',
    replaceSchema: ReplaceLocaleBody.extend({ name: displayName, nativeName: displayName }),
    patchSchema: UpdateLocaleBody.extend({
        name: displayName.optional(),
        nativeName: displayName.optional()
    }),
    // The path param is `:locale`, a language tag — not the `:id` the factory would validate. No
    // format check: `findByTag` matches on a plain string field, never an ObjectId, so a malformed
    // tag already misses every language and falls out through the ordinary 404.
    idFrom: (request) => String(request.params.locale),
    update: (tag, changes, request) =>
        localeService.updateLanguage(tag, changes, callerContextOf(request)),
    present: (row) => row.toJSON() as Language
});
