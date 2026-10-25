/**
 * @module
 * The example schema's contract: what a stored example must carry, where it starts in its
 * lifecycle, and the one index its owner's list leans on.
 */
import { exampleSchema } from '@modules/example/model';
import { ExampleStatus } from '@types';
import { defaultOf, enumOf, indexSpecs, optionsOf, requiredPaths } from '@tests/schema';

describe('exampleSchema', () => {
    it('requires an owner, a title and a body, and nothing else', () => {
        expect(requiredPaths(exampleSchema)).toEqual(['body', 'title', 'userId']);
    });

    it('restricts status to the contract enum and starts every example as a draft', () => {
        expect(enumOf(exampleSchema, 'status')).toEqual(Object.values(ExampleStatus));
        expect(defaultOf(exampleSchema, 'status')).toBe(ExampleStatus.draft);
    });

    it('leaves publishedAt absent until the first publish stamps it', () => {
        // A default here would mark every draft as already published.
        expect(defaultOf(exampleSchema, 'publishedAt')).toBeUndefined();
    });

    it('indexes one owner’s examples, newest first', () => {
        expect(indexSpecs(exampleSchema)).toContain('userId_1_createdAt_-1: userId+1, createdAt-1');
    });

    it('keeps timestamps, which the owner’s list is ordered by', () => {
        expect(optionsOf(exampleSchema).timestamps).toBe(true);
    });
});
