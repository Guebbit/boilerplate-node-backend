/**
 * The two steps every repository-backed service repeats around its own work.
 *
 * Helpers rather than a `createCrudService` factory: what `updateById` and `remove` actually DO
 * differs per entity — which finder, which audit action, which domain event, which cleanup — so a
 * factory would take six knobs and hide the interesting half to deduplicate the uninteresting one.
 * These two steps are the part that is genuinely the same everywhere.
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';

/**
 * Run `handle` on a document that exists, or answer 404.
 *
 * The miss is RETURNED as a reject envelope rather than thrown, which is the protocol every
 * service here follows: a thrown miss is indistinguishable from a genuine database error at the
 * `.catch()` that has to tell them apart.
 *
 * @param found - the repository read, already started
 * @param notFoundKey - the module's own i18n key for "no such thing"
 * @param handle - the work to do once the document is known to exist
 */
export const withDocument = <TDocument, TResult>(
    found: Promise<TDocument | null | undefined>,
    notFoundKey: string,
    handle: (document: TDocument) => Promise<TResult>
): Promise<TResult | ResponseReject> =>
    found.then<TResult | ResponseReject>((document) =>
        document ? handle(document) : generateReject(404, [t(notFoundKey)])
    );

/**
 * Flip `deletedAt` and save.
 *
 * The flip is the point: run against an already soft-deleted document this restores it, which is
 * what the `hardDelete: false` half of `hardDeleteSchema` in `@infrastructure/http/schemas` means.
 *
 * @param document
 * @param save - the module's own repository save
 * @param messageKey - the module's own i18n key for the soft-delete message
 */
export const toggleSoftDelete = <TDocument extends { deletedAt?: Date }>(
    document: TDocument,
    save: (document: TDocument) => Promise<TDocument>,
    messageKey: string
): Promise<ResponseSuccess<TDocument>> => {
    document.deletedAt = document.deletedAt ? undefined : new Date();
    return save(document).then((saved) => generateSuccess(saved, 200, t(messageKey)));
};
