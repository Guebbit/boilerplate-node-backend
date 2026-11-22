/**
 * @module
 * The erase job: an erased account's Zammad customer is deleted through Zammad's own Data Privacy
 * task, which removes the customer, their tickets and articles, their index entries and what only
 * they referred to. The erase hook writes the row inside the erasure's transaction; the leased
 * sweep files one task per customer and follows it to `completed`.
 *
 * Owns:   the `zammaderasejobs` rows and their state (`pending`, `completed`, `failed`).
 * Never:  gives up. An erasure is owed, so a Zammad that is down only delays the job; the gauges
 *         behind `ZammadEraseFailed` and `ZammadEraseStuck` are how a person hears of it.
 *
 * @see docs/modules/zammad.md#erasure
 */

import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { outboxBackoffMs } from '@kernel/outbox';
import { recordAudit } from '@infrastructure/observability/audit';
import { systemCallerContext } from '@kernel/permissions';
import { erasureLedgerRetentionMs } from '@modules/account';
import {
    fileDataPrivacyTask,
    findDataPrivacyTask,
    findUsersByEmail,
    getDataPrivacyTask,
    getUser,
    isPlainCustomer,
    type ZammadUser
} from '../client';
import { zammadAuditActions } from '../audit';
import { zammadSettings, type ZammadSettings } from '../config';
import type { ZammadEraseJobDocument, ZammadEraseTarget } from '../model';
import {
    addEraseJob,
    claimDueEraseJob,
    completeEraseJob,
    failEraseJob,
    groupsVerified,
    reopenEraseJobsSince,
    rescheduleEraseJob,
    saveEraseProgress
} from '../repository';

/** The most jobs one pass advances, so a backlog cannot hold a minute-long job for an hour. */
const PASS_LIMIT = 50;

/**
 * Where one customer stands after a pass: the updated entry, and whether Zammad reported its
 * deletion task failed.
 */
interface TargetOutcome {
    target: ZammadEraseTarget;
    failed: boolean;
    /** The user is not a plain customer: left untouched, for a person. */
    staff?: ZammadUser;
}

/**
 * File the deletion task for a customer, or follow the one already filed (a 422 means one exists).
 *
 * @param settings - where Zammad is
 * @param target - the customer, with no task yet
 * @returns the entry with its task, or done when the task already completed
 */
const fileTask = (settings: ZammadSettings, target: ZammadEraseTarget): Promise<TargetOutcome> =>
    fileDataPrivacyTask(settings, 'User', target.zammadUserId)
        .then((filed) =>
            filed === 'queued' ? findDataPrivacyTask(settings, 'User', target.zammadUserId) : filed
        )
        .then((task) => {
            // 422 and nothing listed: the task is not visible yet; the next pass looks again.
            if (!task) return { target, failed: false };
            return {
                target: {
                    ...target,
                    taskId: task.id,
                    filedAt: target.filedAt ?? new Date(),
                    done: task.state === 'completed'
                },
                failed: task.state === 'failed'
            };
        });

/**
 * Move one customer forward by one step.
 *
 * - A customer Zammad no longer has is done, whatever the task says.
 * - No task yet: file one.
 * - A task: read it. `completed` is done; `failed` parks the job; anything else keeps waiting.
 *
 * @param settings - where Zammad is
 * @param target - the customer
 * @throws {ZammadRequestError} when Zammad cannot be reached or refuses
 */
const advanceTarget = (
    settings: ZammadSettings,
    target: ZammadEraseTarget
): Promise<TargetOutcome> => {
    if (target.done) return Promise.resolve({ target, failed: false });

    return getUser(settings, target.zammadUserId).then((user) => {
        if (!user) return { target: { ...target, done: true }, failed: false };
        // Whichever path named this user (the mapping, a ticket's customer, a race), a non-customer
        // is never filed for deletion: it goes to a person.
        if (!isPlainCustomer(user)) return { target, failed: false, staff: user };
        if (target.taskId === undefined) return fileTask(settings, target);

        return getDataPrivacyTask(settings, target.taskId).then((task) => {
            // A task Zammad no longer lists while the customer remains: file a fresh one.
            if (!task)
                return fileTask(settings, { zammadUserId: target.zammadUserId, done: false });
            return {
                target: { ...target, done: task.state === 'completed' },
                failed: task.state === 'failed'
            };
        });
    });
};

/**
 * Look the account's verified address up in Zammad once, adding every customer that holds it:
 * a person can have written before they had an account. A user with any other role (an agent
 * sharing the address) is never a target: it is returned apart, for a person to look at.
 *
 * @param settings - where Zammad is
 * @param job - the claimed job
 * @returns the customers, now including the address's, and the non-customers that hold it
 */
const withAddressCustomers = (
    settings: ZammadSettings,
    job: ZammadEraseJobDocument
): Promise<{
    targets: ZammadEraseTarget[];
    emailResolved: boolean;
    staffMatches: ZammadUser[];
}> => {
    const known = job.targets.map(({ zammadUserId, taskId, filedAt, done }) => ({
        zammadUserId,
        done,
        ...(taskId === undefined ? {} : { taskId }),
        ...(filedAt ? { filedAt } : {})
    }));
    if (job.emailResolved || !job.email)
        return Promise.resolve({ targets: known, emailResolved: true, staffMatches: [] });

    return findUsersByEmail(settings, job.email).then((users) => ({
        targets: [
            ...known,
            ...users
                .filter(isPlainCustomer)
                .filter((user) => known.every((target) => target.zammadUserId !== user.id))
                .map((user) => ({ zammadUserId: user.id, done: false }))
        ],
        emailResolved: true,
        staffMatches: users.filter((user) => !isPlainCustomer(user))
    }));
};

/**
 * Advance one claimed job by one pass: resolve the address, then step each customer in turn.
 * Sequential: one customer's deletion at a time keeps Zammad's task queue calm.
 *
 * @param settings - where Zammad is
 * @param job - the claimed job
 * @throws {ZammadRequestError} when Zammad cannot be reached or refuses
 */
const advance = async (settings: ZammadSettings, job: ZammadEraseJobDocument): Promise<void> => {
    const resolved = await withAddressCustomers(settings, job);
    const targets: ZammadEraseTarget[] = [];
    const staffMatches = [...resolved.staffMatches];
    let failed = false;
    for (const target of resolved.targets) {
        const outcome = await advanceTarget(settings, target);
        targets.push(outcome.target);
        failed ||= outcome.failed;
        if (outcome.staff) staffMatches.push(outcome.staff);
    }

    if (failed) {
        logger.error({
            message: 'zammad: a deletion task failed; the erase job is parked',
            jobId: String(job._id)
        });
        await failEraseJob(job, targets);
        return;
    }
    // The customers were stepped above; a staff user sharing the address is left untouched and a
    // person decides. Parking raises `ZammadEraseFailed`. Ids and role names only: no address.
    if (staffMatches.length > 0) {
        logger.error({
            message:
                'zammad: the erased address also belongs to a non-customer user, left untouched; the erase job is parked for a person',
            jobId: String(job._id),
            zammadUsers: staffMatches.map(({ id, roles }) => ({ id, roles }))
        });
        await failEraseJob(job, targets);
        return;
    }
    if (targets.every((target) => target.done)) {
        await completeEraseJob(job, targets, erasureLedgerRetentionMs());
        return;
    }
    await saveEraseProgress(job, { targets, emailResolved: resolved.emailResolved });
};

/**
 * A pass failed on Zammad: push the job out by the backoff ladder, never dropping it.
 *
 * @param job - the claimed job
 * @param error - what went wrong
 */
const failedPass = (job: ZammadEraseJobDocument, error: unknown): Promise<unknown> => {
    const attempts = job.attempts + 1;
    logger.warn({
        message: 'zammad: an erase job could not reach Zammad, retrying',
        jobId: String(job._id),
        attempts,
        error
    });
    return rescheduleEraseJob(job, new Date(Date.now() + outboxBackoffMs(attempts)));
};

/**
 * Claim and advance due jobs, one at a time, up to `remaining`.
 *
 * @param settings - where Zammad is
 * @param remaining - how many more this pass may take
 * @returns how many were handled
 */
const drain = (settings: ZammadSettings, remaining: number): Promise<number> =>
    remaining === 0
        ? Promise.resolve(0)
        : claimDueEraseJob().then((job) =>
              job
                  ? advance(settings, job)
                        .catch((error: unknown) => failedPass(job, error))
                        .then(() => drain(settings, remaining - 1))
                        .then((handled) => handled + 1)
                  : 0
          );

/**
 * The scheduled pass: advance every due erase job. Inert while the URL is unset: the rows wait,
 * and the pass resumes when the module is switched on.
 *
 * @returns how many jobs it handled
 */
export const sweepErasures = (): Promise<number> => {
    const settings = zammadSettings();
    return settings ? drain(settings, PASS_LIMIT) : Promise.resolve(0);
};

/**
 * Write the erase job for an erased account, inside the erasure's transaction. The customer ids
 * are the mapping the caller read before it deleted it; the address rides only when verified.
 *
 * @param subject - the erased account
 * @param zammadUserIds - the Zammad customers the account's mapping named
 * @param session - the erasure's transaction
 */
export const queueErasure = (
    subject: { userId: string; email: string; emailVerified: boolean },
    zammadUserIds: readonly number[],
    session: ClientSession
): Promise<void> =>
    // A mapping is always worth a job. A verified address alone is looked up only where Zammad was
    // ever set up (the marker `zammad:setup` leaves), whether or not the URL is set now: with no
    // marker no helpdesk ever held this person, so nothing is queued and no address is kept.
    (zammadUserIds.length > 0
        ? Promise.resolve(true)
        : subject.emailVerified
          ? groupsVerified()
          : Promise.resolve(false)
    ).then((owed) =>
        owed
            ? addEraseJob(
                  {
                      userId: subject.userId,
                      ...(subject.emailVerified ? { email: subject.email } : {}),
                      zammadUserIds
                  },
                  session
              ).then(() => undefined)
            : undefined
    );

/**
 * The erasure race's second half: a ticket was filed for an account that was erased while the call
 * was in flight, so the customer it created is deleted too.
 *
 * @param zammadUserId - the customer the ticket answer named
 * @param userId - the erased account, when the message had one
 */
export const queueRaceErasure = (zammadUserId: number, userId?: string): Promise<void> =>
    addEraseJob({ ...(userId ? { userId } : {}), zammadUserIds: [zammadUserId] }).then(
        () => undefined
    );

/**
 * Replay after Zammad alone was restored from a dump: every erase job completed since the dump goes
 * back to pending, the sweep files its tasks again (a customer the restored database lacks counts
 * as done), and a restoration-log audit row records who did it. Runs on its own: the caller then
 * drives {@link sweepErasures}.
 *
 * @param options - the dump's time, and the restoration-log fields
 * @returns how many jobs were reopened
 */
export const replayErasures = (options: {
    since: Date;
    by: string;
    snapshot?: string;
}): Promise<number> =>
    reopenEraseJobsSince(options.since).then((reopened) => {
        recordAudit(systemCallerContext('User'), {
            action: zammadAuditActions.ZAMMAD_ERASURES_REPLAYED,
            outcome: 'success',
            metadata: {
                by: options.by,
                snapshot: options.snapshot ?? 'unspecified',
                since: options.since.toISOString(),
                reopened
            }
        });
        return reopened;
    });
