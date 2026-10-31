import {
    readPermissionVocabulary,
    renderPermissionVocabulary
} from '../../../../scripts/contracts/permission-vocabulary-render';

/** A small valid document; each refusal test breaks one thing in it. */
const DOCUMENT = {
    actions: ['read', 'sweep'],
    scopes: ['tenant', 'platform'],
    stepUp: ['critical'],
    rules: [
        { action: 'read', subject: 'Order', scope: 'tenant' },
        { action: 'sweep', subject: 'Order', scope: 'tenant', stepUp: 'critical' },
        { action: 'read', subject: 'Cart', scope: 'platform' }
    ],
    sets: ['OrderOwn', 'CartShopping']
};

/** A YAML mapping whose keys are `value`. */
const mapping = (key: string, value: unknown): string =>
    `${key}:\n${(value as string[]).map((name) => `  ${name}: x`).join('\n')}\n`;

/** Writes `DOCUMENT` (with `overrides`) as the YAML the reader takes. */
const yamlOf = (overrides: Record<string, unknown> = {}): string => {
    const merged: Record<string, unknown> = { ...DOCUMENT, ...overrides };
    const block = (key: string, value: unknown): string =>
        `${key}:\n${(value as unknown[])
            .map((item) =>
                typeof item === 'string'
                    ? `  - ${item}`
                    : `  - ${Object.entries(item as Record<string, unknown>)
                          .map(([field, v]) => `${field}: ${String(v)}`)
                          .join('\n    ')}`
            )
            .join('\n')}\n`;
    return [
        block('actions', merged.actions),
        mapping('scopes', merged.scopes),
        mapping('stepUp', merged.stepUp),
        block('rules', merged.rules),
        `sets:\n${(merged.sets as string[]).map((name) => `  - name: ${name}`).join('\n')}\n`
    ].join('');
};

describe('readPermissionVocabulary', () => {
    const vocabulary = readPermissionVocabulary(yamlOf());

    it('returns every list in declared order, subjects in first-seen order', () => {
        expect(vocabulary).toEqual({
            actions: ['read', 'sweep'],
            subjects: ['Order', 'Cart'],
            ruleIds: ['read:Order', 'sweep:Order', 'read:Cart'],
            setNames: ['OrderOwn', 'CartShopping'],
            scopes: ['tenant', 'platform'],
            stepUpTiers: ['critical'],
            pairs: { Order: ['read', 'sweep'], Cart: ['read'] }
        });
    });

    it.each([
        ['has no actions', { actions: [] }, /no `actions:`/],
        ['repeats an action', { actions: ['read', 'read', 'sweep'] }, /repeats `read`/],
        ['has no scopes', { scopes: [] }, /no `scopes:`/],
        ['has no stepUp', { stepUp: [] }, /no `stepUp:`/],
        ['has no sets', { sets: [] }, /no `sets:`/],
        ['repeats a set', { sets: ['A', 'A'] }, /repeats `A`/],
        ['has no rules', { rules: [] }, /no `rules:`/],
        [
            'repeats a rule',
            {
                rules: [
                    { action: 'read', subject: 'Order', scope: 'tenant' },
                    { action: 'read', subject: 'Order', scope: 'tenant' }
                ]
            },
            /repeats `read:Order`/
        ],
        [
            'uses an undeclared action',
            { rules: [{ action: 'nuke', subject: 'Order', scope: 'tenant' }] },
            /undeclared action `nuke`/
        ],
        [
            'uses an undeclared scope',
            { rules: [{ action: 'read', subject: 'Order', scope: 'moon' }] },
            /undeclared scope `moon`/
        ],
        [
            'uses an undeclared stepUp tier',
            {
                rules: [{ action: 'read', subject: 'Order', scope: 'tenant', stepUp: 'lunar' }]
            },
            /undeclared stepUp `"lunar"`/
        ]
    ])('refuses a document that %s', (_case, overrides, message) => {
        expect(() => readPermissionVocabulary(yamlOf(overrides))).toThrow(message);
    });

    it('refuses an empty document', () => {
        expect(() => readPermissionVocabulary('')).toThrow(/no `actions:`/);
    });

    it('refuses an action list holding a non-string', () => {
        expect(() =>
            readPermissionVocabulary(yamlOf().replace('  - sweep\nscopes', '  - 3\nscopes'))
        ).toThrow(/list of strings/);
    });

    it('refuses a rule without a subject', () => {
        expect(() =>
            readPermissionVocabulary(yamlOf().replace('subject: Cart', 'subjct: Cart'))
        ).toThrow(/lacks a `subject`/);
    });
});

describe('renderPermissionVocabulary', () => {
    const output = renderPermissionVocabulary(readPermissionVocabulary(yamlOf()));

    it.each([
        ['PERMISSION_ACTIONS', 'PermissionAction', '"read",\n    "sweep"'],
        ['PERMISSION_SUBJECTS', 'PermissionSubject', '"Order",\n    "Cart"'],
        [
            'PERMISSION_RULE_IDS',
            'PermissionRuleId',
            '"read:Order",\n    "sweep:Order",\n    "read:Cart"'
        ],
        ['PERMISSION_SET_NAMES', 'PermissionSetName', '"OrderOwn",\n    "CartShopping"'],
        ['AUTHORIZATION_SCOPES', 'AuthorizationScope', '"tenant",\n    "platform"'],
        ['STEP_UP_TIERS', 'StepUpTier', '"critical"']
    ])('emits %s in declared order with its union %s', (constName, typeName, rows) => {
        expect(output).toContain(`export const ${constName} = [\n    ${rows}\n] as const;`);
        expect(output).toContain(`export type ${typeName} = (typeof ${constName})[number];`);
    });

    it('emits the pair map and the action-on-subject type', () => {
        expect(output).toContain('"Order": ["read", "sweep"],\n    "Cart": ["read"]');
        expect(output).toContain(
            'export type ActionOn<S extends PermissionSubject> = (typeof PERMISSION_PAIRS)[S][number];'
        );
    });

    it('is deterministic', () => {
        expect(renderPermissionVocabulary(readPermissionVocabulary(yamlOf()))).toBe(output);
    });
});
