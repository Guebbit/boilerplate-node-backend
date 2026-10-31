/**
 * The schemas of the ops rules files (`jobs`, `metrics`, `images`, `outbox`, `defaults`,
 * `step-up`): what each refuses, and that the committed YAML satisfies it. The values themselves
 * are pinned where they are used.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '@tests/paths';
import { defaultsSchema } from '../../../../src/infrastructure/config/shared-rules/defaults';
import { imagesSchema } from '../../../../src/infrastructure/config/shared-rules/images';
import {
    jobsBlockSchema,
    jobsSchema
} from '../../../../src/infrastructure/config/shared-rules/jobs';
import { metricsSchema } from '../../../../src/infrastructure/config/shared-rules/metrics';
import { outboxSchema } from '../../../../src/infrastructure/config/shared-rules/outbox';
import { stepUpDocumentSchema } from '../../../../src/infrastructure/config/shared-rules/step-up';

/**
 * Reads and parses a committed YAML file.
 *
 * @param relative - repo-relative path
 */
const yamlOf = (relative: string): unknown =>
    parse(readFileSync(path.join(REPO_ROOT, relative), 'utf8'));

/** One valid job, to break one field at a time. */
const job = { name: 'reap:things', schedule: '5 2 * * *', summary: 'Deletes things.' };

/** One valid metric, to break one field at a time. */
const counter = {
    name: 'things_total',
    kind: 'counter',
    help: 'Things that happened, in total.'
};

describe('the committed ops rules files', () => {
    it.each([
        ['shared/rules/jobs.yaml', jobsSchema],
        ['shared/rules/metrics.yaml', metricsSchema],
        ['shared/rules/images.yaml', imagesSchema],
        ['shared/rules/outbox.yaml', outboxSchema],
        ['shared/rules/defaults.yaml', defaultsSchema],
        ['shared/authorization-keys.yaml', stepUpDocumentSchema]
    ] as const)('%s satisfies its schema', (file, schema) => {
        expect(schema.safeParse(yamlOf(file)).success).toBe(true);
    });
});

describe('jobsBlockSchema', () => {
    it('accepts a job keyed by its handle', () => {
        expect(jobsBlockSchema.safeParse({ reapThings: job }).success).toBe(true);
    });

    it.each(['clean:things', 'reap:Things', 'reap:'])('refuses the name %s', (name) => {
        expect(jobsBlockSchema.safeParse({ reapThings: { ...job, name } }).success).toBe(false);
    });

    it.each(['5 2 * * ', '5 2 * *', 'daily'])('refuses the schedule "%s"', (schedule) => {
        expect(jobsBlockSchema.safeParse({ reapThings: { ...job, schedule } }).success).toBe(false);
    });

    it('takes step and list cron fields', () => {
        expect(
            jobsBlockSchema.safeParse({ reapThings: { ...job, schedule: '*/5 1,2 * * 1-5' } })
                .success
        ).toBe(true);
    });

    it('refuses a field it does not know, since behaviour belongs in code', () => {
        expect(jobsBlockSchema.safeParse({ reapThings: { ...job, lease: 1 } }).success).toBe(false);
    });
});

describe('metricsSchema', () => {
    it('accepts a counter ending in _total', () => {
        expect(metricsSchema.safeParse({ metrics: { things: counter } }).success).toBe(true);
    });

    it('refuses a counter without the suffix', () => {
        expect(
            metricsSchema.safeParse({ metrics: { things: { ...counter, name: 'things' } } }).success
        ).toBe(false);
    });

    it('lets a gauge carry the suffix', () => {
        expect(
            metricsSchema.safeParse({ metrics: { things: { ...counter, kind: 'gauge' } } }).success
        ).toBe(true);
    });

    it('wants buckets on a histogram and nowhere else', () => {
        const histogram = { ...counter, name: 'things_seconds', kind: 'histogram' };
        expect(metricsSchema.safeParse({ metrics: { things: histogram } }).success).toBe(false);
        expect(
            metricsSchema.safeParse({ metrics: { things: { ...histogram, buckets: [1, 2] } } })
                .success
        ).toBe(true);
        expect(
            metricsSchema.safeParse({ metrics: { things: { ...counter, buckets: [1] } } }).success
        ).toBe(false);
    });

    it('refuses a help text too short to act on', () => {
        expect(
            metricsSchema.safeParse({ metrics: { things: { ...counter, help: 'Things.' } } })
                .success
        ).toBe(false);
    });

    it('refuses two metrics sharing a name', () => {
        expect(
            metricsSchema.safeParse({ metrics: { things: counter, others: counter } }).success
        ).toBe(false);
    });
});

/**
 * An images document around some formats.
 *
 * @param formats - the formats to wrap
 */
const images = (formats: unknown[]) => ({ images: { thumbnailVersion: 'v1', formats } });

describe('imagesSchema', () => {
    const format = {
        mime: 'image/png',
        offset: 0,
        bytes: [0x89],
        extension: 'png',
        reencodable: true
    };

    it('refuses a MIME type listed twice, as a type or as an alias', () => {
        expect(imagesSchema.safeParse(images([format, format])).success).toBe(false);
        expect(
            imagesSchema.safeParse(
                images([
                    format,
                    { ...format, mime: 'image/gif', extension: 'gif', aliases: ['image/png'] }
                ])
            ).success
        ).toBe(false);
    });

    it('refuses a byte outside 0-255', () => {
        expect(
            imagesSchema.safeParse({
                images: { thumbnailVersion: 'v1', formats: [{ ...format, bytes: [256] }] }
            }).success
        ).toBe(false);
    });
});

describe('outbox, defaults and step-up', () => {
    it('refuse a zero or fractional number', () => {
        expect(
            outboxSchema.safeParse({
                outbox: {
                    retentionDays: 0,
                    maxAttempts: 1,
                    leaseSeconds: 1,
                    backoffBaseMs: 1,
                    backoffCapMs: 1
                }
            }).success
        ).toBe(false);
        expect(
            stepUpDocumentSchema.safeParse({ stepUp: { critical: 1.5, sensitive: 9 } }).success
        ).toBe(false);
    });

    it('refuse a tier it does not know', () => {
        expect(
            stepUpDocumentSchema.safeParse({ stepUp: { critical: 1, sensitive: 2, trivial: 3 } })
                .success
        ).toBe(false);
    });
});
