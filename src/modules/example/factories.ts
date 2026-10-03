/**
 * @module
 * In any module: how a row is built for a test or a seed. Reachable at `@modules/<name>/factories`
 * and never from the barrel — it writes past the rules a service enforces.
 */

import { Types } from 'mongoose';
import { ExampleStatus } from '@types';
import type { ExampleDocument } from './model';

/** What a caller may vary when building an example; everything else takes a default. */
export interface ExampleOverrides {
    /** 24-char hex of the owning user. */
    userId: string;
    /** Defaults to a fixed title. */
    title?: string;
    /** Defaults to a fixed body. */
    body?: string;
    /** Defaults to `draft`. */
    status?: ExampleStatus;
    /** Pins the `_id`, for a seed that must find the same row again. */
    id?: string;
    /** Stamped as published; leave out for a draft. */
    publishedAt?: Date;
}

/** An example fixture with its `_id` pinned — what a seed needs to find the same row again. */
export type PinnedExample = Partial<ExampleDocument> & { _id: Types.ObjectId };

/**
 * Build an example ready for `exampleRepository.create`.
 * @param overrides - the owner, plus anything else the case cares about
 */
export const makeExample = (overrides: ExampleOverrides): Partial<ExampleDocument> => ({
    ...(overrides.id === undefined ? {} : { _id: new Types.ObjectId(overrides.id) }),
    userId: new Types.ObjectId(overrides.userId),
    title: overrides.title ?? 'An example',
    body: overrides.body ?? 'What this example says.',
    status: overrides.status ?? ExampleStatus.draft,
    ...(overrides.publishedAt === undefined ? {} : { publishedAt: overrides.publishedAt })
});
