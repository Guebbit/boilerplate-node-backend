/**
 * @module
 * The example's lifecycle rules, with no database: which events each status allows, when
 * `publishedAt` stamps, and the body ceiling.
 */

import { ExampleStatus } from '@types';
import {
    canApply,
    exampleActionsFor,
    fitsBodyLength,
    initialExampleStatus,
    isPublished,
    shouldStampPublishedAt,
    statusAfter
} from '../../domain';

describe('initialExampleStatus', () => {
    it('is draft: nothing is public until its owner says so', () => {
        expect(initialExampleStatus).toBe(ExampleStatus.draft);
    });
});

describe('canApply', () => {
    it.each([
        ['publish', ExampleStatus.draft],
        ['archive', ExampleStatus.draft],
        ['archive', ExampleStatus.published],
        ['unarchive', ExampleStatus.archived]
    ] as const)('allows %s from %s', (event, status) => {
        expect(canApply(event, status)).toBe(true);
    });

    it.each([
        ['publish', ExampleStatus.published],
        ['publish', ExampleStatus.archived],
        ['archive', ExampleStatus.archived],
        ['unarchive', ExampleStatus.draft],
        ['unarchive', ExampleStatus.published]
    ] as const)(
        'refuses %s from %s: a published example is withdrawn by archiving it',
        (event, status) => {
            expect(canApply(event, status)).toBe(false);
        }
    );
});

describe('statusAfter', () => {
    it.each([
        ['publish', ExampleStatus.published],
        ['archive', ExampleStatus.archived],
        ['unarchive', ExampleStatus.draft]
    ] as const)('leaves an example %s-ed in %s', (event, status) => {
        expect(statusAfter(event)).toBe(status);
    });
});

describe('isPublished', () => {
    it('is true for published only', () => {
        expect(Object.values(ExampleStatus).filter((status) => isPublished(status))).toEqual([
            ExampleStatus.published
        ]);
    });
});

describe('shouldStampPublishedAt', () => {
    it('stamps the first time an example is published', () => {
        expect(shouldStampPublishedAt(ExampleStatus.published, undefined)).toBe(true);
    });

    it('never moves a stamp that is already there', () => {
        expect(shouldStampPublishedAt(ExampleStatus.published, new Date())).toBe(false);
    });

    it.each([ExampleStatus.draft, ExampleStatus.archived])(
        'does not stamp for a write that leaves it %s',
        (status) => {
            expect(shouldStampPublishedAt(status, undefined)).toBe(false);
        }
    );
});

describe('fitsBodyLength', () => {
    it('accepts a body exactly at the ceiling', () => {
        expect(fitsBodyLength('abc', 3)).toBe(true);
    });

    it('refuses a body one character over it', () => {
        expect(fitsBodyLength('abcd', 3)).toBe(false);
    });
});

describe('exampleActionsFor', () => {
    it.each([
        [ExampleStatus.draft, { publish: true, archive: true, unarchive: false }],
        [ExampleStatus.published, { publish: false, archive: true, unarchive: false }],
        [ExampleStatus.archived, { publish: false, archive: false, unarchive: true }]
    ])('lists the open events for a caller who may edit an example in %s', (status, open) => {
        expect(exampleActionsFor(status, { update: true, delete: true })).toEqual({
            ...open,
            update: true,
            delete: true
        });
    });

    it('lists no event for a caller who may not edit', () => {
        expect(exampleActionsFor(ExampleStatus.draft, { update: false, delete: false })).toEqual({
            publish: false,
            archive: false,
            unarchive: false,
            update: false,
            delete: false
        });
    });
});
