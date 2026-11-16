// citation-fixture: the docs/… strings in this file are checker inputs, not citations
import { moduleDescriptorSchema } from '../../../../scripts/docs/module-descriptor';

/** The smallest descriptor the schema accepts. */
const MINIMAL = { summary: 'A thing.', subdomain: 'generic', group: 'foundation', dependsOn: [] };

describe('moduleDescriptorSchema', () => {
    it('accepts the minimal descriptor, with the optional declarations absent', () => {
        expect(moduleDescriptorSchema.parse(MINIMAL)).toEqual(MINIMAL);
    });

    it('requires a summary, because the docs list is generated from it', () => {
        const { summary: _summary, ...withoutSummary } = MINIMAL;

        expect(moduleDescriptorSchema.safeParse(withoutSummary).success).toBe(false);
    });

    it('refuses a key it does not know, so a typo is not silently ignored', () => {
        expect(moduleDescriptorSchema.safeParse({ ...MINIMAL, noSummary: 'x' }).success).toBe(
            false
        );
    });
});
