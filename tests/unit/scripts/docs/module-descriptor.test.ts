import {
    frontendCounterparts,
    moduleDescriptorSchema
} from '../../../../scripts/docs/module-descriptor';

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

    it('refuses a noAudit with no reason in it', () => {
        expect(moduleDescriptorSchema.safeParse({ ...MINIMAL, noAudit: '' }).success).toBe(false);
    });

    it('refuses a key it does not know, so a typo is not silently ignored', () => {
        expect(moduleDescriptorSchema.safeParse({ ...MINIMAL, noAudits: 'x' }).success).toBe(false);
    });
});

describe('frontendCounterparts', () => {
    it('is the module’s own name when the descriptor says nothing', () => {
        expect(frontendCounterparts('cart', moduleDescriptorSchema.parse(MINIMAL))).toEqual([
            'cart'
        ]);
    });

    it('is the declared list otherwise, an empty one included', () => {
        const declared = moduleDescriptorSchema.parse({
            ...MINIMAL,
            frontend: { counterparts: [], why: 'No screen.' }
        });

        expect(frontendCounterparts('access', declared)).toEqual([]);
    });
});
