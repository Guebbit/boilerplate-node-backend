/**
 * @module
 * What the manifest hands to the application: the public webhook projection, the translatable
 * fields, and the pieces `account` and `users` call without importing this module.
 */

import module from '../../module';
import { EXAMPLE_PUBLISHED } from '../../events';
import { exampleRateLimits } from '../../rate-limits';

describe('the example manifest', () => {
    it('is named for its folder and mounted at the plural collection path', () => {
        expect(module.name).toBe('example');
        expect(module.basePath).toBe('/examples');
    });

    it('projects example.published into the public event, carrying the id and title only', () => {
        const projected = module.publicEvents[EXAMPLE_PUBLISHED].toPublicEvent({
            exampleId: 'a'.repeat(24),
            userId: 'b'.repeat(24),
            title: 'Hello'
        } as never);

        // The owner's id is not part of what a subscriber is told.
        expect(projected).toEqual({
            eventType: 'example.published',
            data: { exampleId: 'a'.repeat(24), title: 'Hello' }
        });
    });

    it('makes the title, and only the title, translatable', () => {
        expect(module.translatables.example.fields).toEqual(['title']);
        expect(module.translatables.example.collection).toBe('examples');
    });

    it('registers the image target under the key the digest job names', () => {
        expect(Object.keys(module.imageTargets)).toEqual(['examples']);
    });

    it('declares both halves of personal data: an export and an erasure', () => {
        const [section] = module.personalData as { section: string; erase?: unknown }[];

        expect(section.section).toBe('examples');
        expect(typeof section.erase).toBe('function');
    });

    it('lists the budgets its limiter is built from', () => {
        expect(module.rateLimits).toBe(exampleRateLimits);
    });
});

describe('the creation budget', () => {
    it('is keyed on the account, spent by success, and audited when refused', () => {
        const [budget] = exampleRateLimits;

        expect(budget.environmentVariable).toBe('NODE_EXAMPLE_RATE_LIMIT_MAX');
        expect(budget.keyedBy).toBe('the authenticated account');
        expect(budget.skipSuccessfulRequests).toBeUndefined();
        expect(budget.audited).toBe(true);
    });
});
