import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { refreshLocaleOverrides } from '@infrastructure/i18n';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { localeService } from '../service';
import { localeAuditActions } from '../audit';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * DELETE /locales/:locale (admin)
 * Remove a language and every string translated into it.
 *
 * Refuses with 409 while the language is still active — the guard lives in the service, next to
 * the cascade it protects. That two-step is the only safeguard this operation has: there is no
 * soft delete here and no undo, and the rows it destroys are somebody's week.
 *
 * The response carries no body, like every other delete in this API. The number of entries removed
 * goes into the AUDIT record instead, where it is worth having: "deleted a language" and "deleted
 * a language and four hundred translated strings" are different events, and only the trail is in a
 * position to tell them apart afterwards.
 */
export const deleteLocale = (request: Request<{ locale: string }>, response: Response) =>
    localeService
        .deleteLanguage(request.params.locale)
        .then((result) => {
            if (refused(response, result)) return;

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: localeAuditActions.ADMIN_LOCALE_DELETED,
                    outcome: 'success',
                    target_type: 'locale',
                    target_id: request.params.locale,
                    metadata: { removedEntries: result.data?.removedEntries }
                })
            );

            // A deleted override must stop answering on this worker at once; the others
            // pick it up on their next scheduled refresh. Not awaited — see
            // `refreshOverrides` in ./write-locale-entries.ts.
            void refreshLocaleOverrides();

            return successResponse(response, undefined);
        })
        .catch(catchAs(response, 'deleteLocale'));
