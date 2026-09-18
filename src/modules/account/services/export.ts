/**
 * @module
 * `POST /account/export` — one JSON answer to "give me my data" (Art. 15, 20), assembled from
 * every registered {@link PersonalDataSection}. Its own file, beside `profile.ts` and
 * `authentication.ts`: it is neither proving identity (that's `requireFreshAuth`'s job, mounted
 * on the route) nor changing the account.
 *
 * Every section comes from the OWNING module's own `collect`, never a repository or model type
 * reached around it — this file cannot describe a shape its own reads didn't produce, because it
 * has no reads of its own left. See `kernel/registry.ts`'s `PersonalDataSection` and
 * `./personal-data-registry.ts` for how the list gets here without this module importing every
 * sibling that contributes to it.
 */

import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { CallerContext } from '@types';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { t } from '@infrastructure/i18n';
import { personalDataSections } from './personal-data-registry';
import { accountAuditActions } from '../audit';

/** The key the `profile` section is required to register under — see the 404 check below. */
const PROFILE_SECTION = 'profile';

/**
 * The assembled export — one key per registered section, plus `exportedAt`. Not the generated
 * `AccountExportResponse` type: that lives in `shared/contracts/openapi.root.yaml`, assembled
 * from every contributing module's OWN schema, and this file has no way to know their shapes
 * statically any more than it has a way to read their data directly. The envelope validation on
 * the way out is what actually holds this to the contract.
 */
type AccountExportPayload = Record<string, unknown> & { exportedAt: string };

/**
 * Assemble and return the caller's own data — the whole point of the endpoint.
 *
 * Every registered section runs, unconditionally: a section resolving `undefined` is OMITTED
 * from the envelope (the shape `feedback`'s opt-out flag uses — see
 * `modules/feedback/module.ts`), which is different from a section that REJECTS, which fails the
 * whole request. An incomplete Art. 15 answer must never look like a complete one.
 *
 * @param userId - the authenticated caller's own id; this never reads anyone else's data
 * @param email - the authenticated caller's own email — the key the `feedback` section (open to
 *   people with no account) matches its rows by, instead of an id
 * @param context - for the audit event this call itself is
 */
export const exportOwnData = (
    userId: string,
    email: string,
    context: CallerContext
): Promise<ResponseSuccess<AccountExportPayload> | ResponseReject> => {
    const subject = { userId, email };

    return Promise.all(
        personalDataSections().map((section) =>
            section.collect(subject).then((value) => [section.section, value] as const)
        )
    ).then((entries) => {
        const profile = entries.find(([section]) => section === PROFILE_SECTION)?.[1];
        if (!profile) return generateReject(404, [t('users.not-found')]);

        const payload = Object.fromEntries(
            entries.filter(([, value]) => value !== undefined)
        ) as Record<string, unknown>;

        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_DATA_EXPORTED,
                outcome: 'success'
            })
        );

        return generateSuccess({ ...payload, exportedAt: new Date().toISOString() });
    });
};
