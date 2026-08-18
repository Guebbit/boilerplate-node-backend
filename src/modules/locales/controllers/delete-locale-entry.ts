import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { refreshLocaleOverrides } from '@infrastructure/i18n';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { localeService } from '../service';
import { localeAuditActions } from '../audit';

/**
 * DELETE /locales/:locale/entries/:entryId (admin)
 * Remove one key from one language.
 *
 * One language only, deliberately. A key is stored once per language, so deleting the Spanish row
 * leaves the Italian one standing — which is what a translator working through a list expects, and
 * the reason the collection is one row per (language, key) rather than one row per key holding
 * every language.
 *
 * The key goes into the audit metadata rather than into the response: a delete answers with no
 * body here as it does everywhere else, and "which string disappeared" is a question asked
 * afterwards, of the trail.
 */
export const deleteLocaleEntry = (
    request: Request<{ locale: string; entryId: string }>,
    response: Response
) =>
    localeService
        .deleteEntry(request.params.locale, request.params.entryId)
        .then((result) => {
            if (!result.success) return rejectResponse(response, result.status, result.errors);

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: localeAuditActions.ADMIN_LOCALE_ENTRY_DELETED,
                    outcome: 'success',
                    target_type: 'locale_entry',
                    target_id: request.params.entryId,
                    metadata: { locale: request.params.locale, key: result.data?.key }
                })
            );

            // A deleted override must stop answering on this worker at once; the others
            // pick it up on their next scheduled refresh. Not awaited — see
            // `refreshOverrides` in ./write-locale-entries.ts.
            void refreshLocaleOverrides();

            return successResponse(response, undefined);
        })
        .catch((error: Error) => rejectDatabaseError(response, 'deleteLocaleEntry', error));
