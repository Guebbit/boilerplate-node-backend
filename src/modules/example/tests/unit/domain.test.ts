/**
 * @module
 * The example's lifecycle rules, with no database: which status may follow which, when
 * `publishedAt` stamps, and the body ceiling.
 */

import { ExampleStatus } from '@types';
import {
    canTransition,
    exampleActionsFor,
    fitsBodyLength,
    initialExampleStatus,
    isPublished,
    shouldStampPublishedAt,
    statusesReachableFrom
} from '../../domain';

describe('initialExampleStatus', () => {
    it('is draft: nothing is public until its owner says so', () => {
        expect(initialExampleStatus).toBe(ExampleStatus.draft);
    });
});

describe('canTransition', () => {
    it.each([
        [ExampleStatus.draft, ExampleStatus.published],
        [ExampleStatus.draft, ExampleStatus.archived],
        [ExampleStatus.published, ExampleStatus.archived],
        [ExampleStatus.archived, ExampleStatus.draft]
    ])('allows %s to %s', (from, to) => {
        expect(canTransition(from, to)).toBe(true);
    });

    it.each([
        [ExampleStatus.published, ExampleStatus.draft],
        [ExampleStatus.archived, ExampleStatus.published]
    ])('refuses %s to %s: a published example is withdrawn by archiving it', (from, to) => {
        expect(canTransition(from, to)).toBe(false);
    });

    it.each(Object.values(ExampleStatus))(
        'refuses %s staying where it is: that is no move',
        (status) => {
            expect(canTransition(status, status)).toBe(false);
        }
    );
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

describe('statusesReachableFrom', () => {
    it.each([
        [ExampleStatus.draft, [ExampleStatus.published, ExampleStatus.archived]],
        [ExampleStatus.published, [ExampleStatus.archived]],
        [ExampleStatus.archived, [ExampleStatus.draft]]
    ])('lists the moves from %s, its own status excluded', (status, expected) => {
        expect(statusesReachableFrom(status)).toEqual(expected);
    });
});

describe('exampleActionsFor', () => {
    it('lists the moves for a caller who may edit', () => {
        expect(exampleActionsFor(ExampleStatus.draft, { update: true, delete: true })).toEqual({
            transitions: [ExampleStatus.published, ExampleStatus.archived],
            update: true,
            delete: true
        });
    });

    it('lists none for a caller who may not edit', () => {
        expect(exampleActionsFor(ExampleStatus.draft, { update: false, delete: false })).toEqual({
            transitions: [],
            update: false,
            delete: false
        });
    });
});
