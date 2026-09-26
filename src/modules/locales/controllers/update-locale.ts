/**
 * @module
 * Controllers for `PUT /locales/:locale` (replace) and `PATCH /locales/:locale` (merge), built on
 * the shared `createUpdateController` factory. The tag is not editable — every entry references
 * it, so changing it would rename a whole dictionary — which is why it is read from the path,
 * never the body.
 */

import { ReplaceLocaleBody, UpdateLocaleBody } from '@api/schemas.zod';
import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import type { Language } from '@types';

/**
 * `PUT` and `PATCH /locales/:locale` — one handler pair over `updateLanguage`, which audits the
 * change itself.
 */
export const { replace: replaceLocale, update: updateLocale } = createUpdateController({
    entity: 'locale',
    replaceSchema: ReplaceLocaleBody.extend({
        name: localeService.localeDisplayName,
        nativeName: localeService.localeDisplayName
    }),
    patchSchema: UpdateLocaleBody.extend({
        name: localeService.localeDisplayName.optional(),
        nativeName: localeService.localeDisplayName.optional()
    }),
    // The path param is `:locale`, a language tag — not the `:id` the factory would validate. No
    // format check: `findByTag` matches on a plain string field, never an ObjectId, so a malformed
    // tag already misses every language and falls out through the ordinary 404.
    idFrom: (request) => String(request.params.locale),
    update: (tag, changes, request) =>
        localeService.updateLanguage(tag, changes, callerContextOf(request)),
    // `.toJSON()` applies the model's `_id` → `id` transform; the document is typed as stored, not
    // as the wire shape `Language` promises.
    present: (row) => row.toJSON() as Language
});
