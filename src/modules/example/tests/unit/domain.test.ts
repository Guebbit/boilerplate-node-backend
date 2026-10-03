/**
 * @module
 * The example's lifecycle rules, with no database: which status may follow which, when
 * `publishedAt` stamps, and the body ceiling.
 */

import { ExampleStatus } from '@types';
import {
    canTransition,
    fitsBodyLength,
    initialExampleStatus,
    isPublished,
    shouldStampPublishedAt
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
        'lets %s stay where it is, so a PUT can restate it',
        (status) => {
            expect(canTransition(status, status)).toBe(true);
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
