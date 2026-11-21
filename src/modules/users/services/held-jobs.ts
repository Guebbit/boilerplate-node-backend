/**
 * @module
 * Jobs held in the durable fallback queue (`jobs`) that still name an erased account's address.
 * A mail job carries only an address, never a user id, so an erasure cannot find it by id.
 *
 * Why here:  the erasure cascade (`./remove.ts`) and the restore's final pass
 *            (`ops:reapply-erasures`, through `account`) both need it.
 */

import { z } from 'zod';
import type { ClientSession } from 'mongoose';
import { deleteJobsMentioning } from '@infrastructure/persistence/job-store';
import { discardSpooled } from '@infrastructure/adapters/mail-spool';
import type { AfterErase } from '@kernel/registry';

/** The one part of a held mail job that points outside the database: its spooled attachments. */
const attachmentsSchema = z.object({
    request: z.object({ attachments: z.array(z.object({ key: z.string() })) })
});

/**
 * The spool keys a held job's payload names, none for a job that is not a mail or has no attachment.
 *
 * @param payload - a held job's payload, which no schema promises
 */
const spoolKeysOf = (payload: unknown): string[] => {
    const parsed = attachmentsSchema.safeParse(payload);
    return parsed.success ? parsed.data.request.attachments.map(({ key }) => key) : [];
};

/** What removing the held jobs of some addresses did. */
export interface RemovedHeldJobs {
    /** The ids of the deleted jobs: a count and these, never the addresses, go in a log. */
    ids: string[];
    /** Deletes the spooled attachment files; files are not transactional, so it waits for the commit. */
    discardAttachments: AfterErase;
}

/**
 * Delete the held jobs, of every status, that mention any of `addresses`.
 *
 * @param addresses - the erased account's addresses
 * @param session - the erasure's transaction; absent outside one
 */
export const removeHeldJobs = (
    addresses: readonly string[],
    session?: ClientSession
): Promise<RemovedHeldJobs> =>
    deleteJobsMentioning(addresses, session).then((deleted) => ({
        ids: deleted.map(({ id }) => id),
        discardAttachments: () =>
            Promise.all(
                deleted.flatMap(({ payload }) =>
                    spoolKeysOf(payload).map((key) => discardSpooled(key))
                )
            ).then(() => undefined)
    }));

/**
 * The restore's final pass for one erased account: delete what step 4 let reach the queue after
 * the account's own erasure, attachments included, with no transaction around it.
 *
 * @param addresses - the erased account's addresses
 * @returns the ids of the deleted jobs
 */
export const purgeHeldJobsOf = (addresses: readonly string[]): Promise<string[]> =>
    removeHeldJobs(addresses).then(({ ids, discardAttachments }) =>
        discardAttachments().then(() => ids)
    );
