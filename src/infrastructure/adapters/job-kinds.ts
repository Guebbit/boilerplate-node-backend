/**
 * @module
 * What KIND of work each job channel carries, and which worker process takes which kind.
 *
 * Kinds:    `light`    a quick database or in-memory step; no channel has one today.
 *           `external` waits on something outside the process: SMTP, a subscriber's endpoint.
 *           `heavy`    CPU, memory or a large read: an image decode, a whole-account export.
 * Why:      one process cannot size itself for all three. `worker` takes light + external, cheap
 *           and I/O-bound, many in flight. `worker-heavy` takes heavy, one at a time, under a
 *           memory cap, so a burst of uploads cannot starve a mail.
 * Mapping:  in code, keyed by the generated `WorkerChannel`, so a new channel is a compile error
 *           until it is given a kind. Not in the contract: the twin backends share the channel
 *           names, and each decides its own sizing.
 *
 * @see docs/understand/rabbitmq.md#job-kinds
 */

import { WORKER_CHANNELS, type WorkerChannel } from '@types';
import type { WorkerRole } from '@infrastructure/runtime/config';

/** Every kind of job, cheapest first. */
export const JOB_KINDS = ['light', 'external', 'heavy'] as const;

/** See the module header. */
export type JobKind = (typeof JOB_KINDS)[number];

/** The kind each channel's jobs are. */
export const JOB_KIND_BY_CHANNEL: Record<WorkerChannel, JobKind> = {
    [WORKER_CHANNELS.EMAIL_SEND]: 'external',
    [WORKER_CHANNELS.EMAIL_URGENT]: 'external',
    [WORKER_CHANNELS.WEBHOOK_DELIVER]: 'external',
    [WORKER_CHANNELS.IMAGE_DIGEST]: 'heavy',
    [WORKER_CHANNELS.ACCOUNT_EXPORT]: 'heavy'
};

/** The kinds each worker role takes. */
const KINDS_OF_ROLE: Record<WorkerRole, readonly JobKind[]> = {
    standard: ['light', 'external'],
    heavy: ['heavy']
};

/**
 * Whether a worker in `role` takes jobs from `channel`.
 *
 * @param role - the process's role
 * @param channel - a job channel; a name no kind is declared for is not taken by anyone
 */
export const isServedBy = (role: WorkerRole, channel: string): boolean => {
    const entry = Object.entries(JOB_KIND_BY_CHANNEL).find(([name]) => name === channel);
    return entry !== undefined && KINDS_OF_ROLE[role].includes(entry[1]);
};
