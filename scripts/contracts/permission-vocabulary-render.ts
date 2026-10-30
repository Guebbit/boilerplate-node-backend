/**
 * Pure half of the permission-vocabulary generator: read the closed lists out of the shared
 * authorization document, and render the TypeScript that carries them. No filesystem, so a test
 * can walk it.
 *
 * SHARED SCRIPT — kept identical in both repos of the pair by hand; it is not in
 * `SHARED_FILES` on purpose (docs/tools/pairing-and-ports.md, "Convenience is not necessity").
 * See: docs/tools/permission-vocabulary.md
 */
import { parse } from 'yaml';

/** Every closed list the shared authorization keys declare, in declared order. */
export interface PermissionVocabulary {
    /** `actions:`. */
    actions: string[];
    /** Distinct `subject` of the rules, in first-seen order. */
    subjects: string[];
    /** `<action>:<subject>` of every rule, in declared order. */
    ruleIds: string[];
    /** `name` of every set, in declared order. */
    setNames: string[];
    /** Keys of `scopes:`. */
    scopes: string[];
    /** Keys of `stepUp:`. */
    stepUpTiers: string[];
    /** Per subject, the actions some rule carries on it. */
    pairs: Record<string, string[]>;
}

/** A parsed document, before any of it is trusted. */
type Raw = Record<string, unknown>;

/**
 * A non-empty list of strings under `key`, or a refusal naming it.
 *
 * @param raw - the parsed document
 * @param key - the top-level key
 * @param what - the text of the refusal's subject
 * @throws {Error} when the list is missing, empty or holds a non-string
 */
const stringList = (raw: Raw, key: string, what: string): string[] => {
    const value = raw[key];
    if (!Array.isArray(value) || value.length === 0)
        throw new Error(`authorization-keys.yaml declares no \`${what}\` list`);
    if (!value.every((item): item is string => typeof item === 'string'))
        throw new Error(`authorization-keys.yaml \`${what}\` must be a list of strings`);
    return value;
};

/**
 * The names a mapping declares as keys, non-empty.
 *
 * @param raw - the parsed document
 * @param key - the top-level key holding the mapping
 * @throws {Error} when it is not a non-empty mapping
 */
const mappingKeys = (raw: Raw, key: string): string[] => {
    const value = raw[key];
    const keys =
        typeof value === 'object' && value !== null && !Array.isArray(value)
            ? Object.keys(value)
            : [];
    if (keys.length === 0) throw new Error(`authorization-keys.yaml declares no \`${key}:\` map`);
    return keys;
};

/**
 * One field of every entry of a list of mappings.
 *
 * @param raw - the parsed document
 * @param key - the top-level list (`rules`, `sets`)
 * @param field - the field to read off each entry
 * @throws {Error} when the list or a field is missing or not a non-empty string
 */
const fieldOfEach = (raw: Raw, key: string, field: string): string[] => {
    const entries: unknown = raw[key];
    if (!Array.isArray(entries) || entries.length === 0)
        throw new Error(`authorization-keys.yaml declares no \`${key}:\` list`);
    return entries.map((entry: unknown) => {
        const value = (entry as Raw | null)?.[field];
        if (typeof value !== 'string' || value === '')
            throw new Error(`authorization-keys.yaml \`${key}:\` entry lacks a \`${field}\``);
        return value;
    });
};

/**
 * Refuses a list that repeats an entry.
 *
 * @param list - the list to check
 * @param what - how the refusal names it
 * @throws {Error} naming the first repeat
 */
const assertUnique = (list: readonly string[], what: string): void => {
    const repeat = list.find((item, index) => list.indexOf(item) !== index);
    if (repeat !== undefined)
        throw new Error(`authorization-keys.yaml \`${what}\` repeats \`${repeat}\``);
};

/**
 * Reads every closed list out of the shared authorization document.
 *
 * @param yamlText - the whole document
 * @returns the lists, in declared order
 * @throws {Error} when a list is missing, empty, repeats an entry, or a rule uses an undeclared
 * action, scope or step-up tier
 */
export const readPermissionVocabulary = (yamlText: string): PermissionVocabulary => {
    const raw = (parse(yamlText) ?? {}) as Raw;
    const actions = stringList(raw, 'actions', 'actions:');
    const scopes = mappingKeys(raw, 'scopes');
    const stepUpTiers = mappingKeys(raw, 'stepUp');
    const ruleActions = fieldOfEach(raw, 'rules', 'action');
    const ruleSubjects = fieldOfEach(raw, 'rules', 'subject');
    const setNames = fieldOfEach(raw, 'sets', 'name');
    assertUnique(actions, 'actions:');
    assertUnique(setNames, 'sets:');

    const rules = raw.rules as Raw[];
    for (const [index, rule] of rules.entries()) {
        const action = ruleActions[index];
        if (!actions.includes(action))
            throw new Error(`authorization-keys.yaml rule uses undeclared action \`${action}\``);
        const { scope, stepUp: tier } = rule;
        if (typeof scope !== 'string' || !scopes.includes(scope))
            throw new Error(
                `authorization-keys.yaml rule has undeclared scope \`${String(scope)}\``
            );
        if (tier !== undefined && (typeof tier !== 'string' || !stepUpTiers.includes(tier)))
            throw new Error(
                `authorization-keys.yaml rule has undeclared stepUp \`${JSON.stringify(tier)}\``
            );
    }

    const ruleIds = ruleActions.map((action, index) => `${action}:${ruleSubjects[index]}`);
    assertUnique(ruleIds, 'rules:');

    const subjects = [...new Set(ruleSubjects)];
    const pairs: Record<string, string[]> = Object.fromEntries(
        subjects.map((subject) => [subject, [] as string[]])
    );
    for (const [index, action] of ruleActions.entries()) pairs[ruleSubjects[index]].push(action);
    return { actions, subjects, ruleIds, setNames, scopes, stepUpTiers, pairs };
};

/**
 * One exported list plus the union drawn from it.
 *
 * @param constName - the runtime array's name
 * @param typeName - the union type's name
 * @param description - what the list is
 * @param items - its entries, in order
 */
const renderList = (
    constName: string,
    typeName: string,
    description: string,
    items: readonly string[]
): string => {
    const rows = items.map((item) => `    ${JSON.stringify(item)}`).join(',\n');
    return (
        `/** ${description} */\n` +
        `export const ${constName} = [\n${rows}\n] as const;\n\n` +
        `/** One of {@link ${constName}}. */\n` +
        `export type ${typeName} = (typeof ${constName})[number];\n\n`
    );
};

/**
 * The generated module: every closed list, its union, and the subject-to-actions pair map.
 *
 * @param vocabulary - what {@link readPermissionVocabulary} returned
 * @returns the file's full text
 */
export const renderPermissionVocabulary = (vocabulary: PermissionVocabulary): string => {
    const pairRows = Object.entries(vocabulary.pairs)
        .map(([subject, actions]) => {
            const list = actions.map((action) => JSON.stringify(action)).join(', ');
            return `    ${JSON.stringify(subject)}: [${list}]`;
        })
        .join(',\n');
    return (
        '// Code generated by `npm run gen:api`. DO NOT EDIT.\n' +
        '/*\n' +
        ' * GENERATED — do not edit manually.\n' +
        ' * Source: shared/authorization-keys.yaml  |  Regenerate: npm run gen:api\n' +
        ' */\n\n' +
        renderList(
            'PERMISSION_ACTIONS',
            'PermissionAction',
            'Every action a permission key may carry, as declared by the shared authorization keys.',
            vocabulary.actions
        ) +
        renderList(
            'PERMISSION_SUBJECTS',
            'PermissionSubject',
            'Every subject a declared rule is about.',
            vocabulary.subjects
        ) +
        renderList(
            'PERMISSION_RULE_IDS',
            'PermissionRuleId',
            'Every declared rule id, `<action>:<subject>`.',
            vocabulary.ruleIds
        ) +
        renderList(
            'PERMISSION_SET_NAMES',
            'PermissionSetName',
            'Every declared permission set.',
            vocabulary.setNames
        ) +
        renderList(
            'AUTHORIZATION_SCOPES',
            'AuthorizationScope',
            'The scopes a rule or role may carry.',
            vocabulary.scopes
        ) +
        renderList(
            'STEP_UP_TIERS',
            'StepUpTier',
            'The step-up tiers a rule may demand.',
            vocabulary.stepUpTiers
        ) +
        '/** Per subject, the actions a declared rule carries on it: the only valid pairs. */\n' +
        `export const PERMISSION_PAIRS = {\n${pairRows}\n} as const;\n\n` +
        '/** The actions a declared rule carries on subject `S`. */\n' +
        'export type ActionOn<S extends PermissionSubject> = (typeof PERMISSION_PAIRS)[S][number];\n'
    );
};
