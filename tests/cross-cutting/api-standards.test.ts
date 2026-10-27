/**
 * The REST standards the contract and the module layout state in prose, held as checks so the
 * next module cannot stop halfway through them.
 *
 * Four rules, each read from the SOURCE (the module fragments and the `.ts` files), never from
 * the generated bundle, so a failure names a file somebody edits:
 *
 * | Rule | Where it is written |
 * | --- | --- |
 * | A resource with a lifecycle `status` publishes a required `actions` | docs/theory/tactical-ddd.md |
 * | A presenter maps; it never asks who the caller is | docs/theory/tactical-ddd.md |
 * | A 409 refusal carries a code the contract lists | docs/api/write-methods.md |
 * | A paged list takes `sort` or states its one fixed order | docs/api/sorting.md |
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { MODULES_ROOT, REPO_ROOT } from '@tests/paths';

/** The slice of a JSON-schema node these checks read. */
interface SchemaNode {
    $ref?: string;
    enum?: unknown[];
    allOf?: SchemaNode[];
    required?: string[];
    properties?: Record<string, SchemaNode>;
}

/** One operation of a module's contract. */
interface OperationNode {
    operationId?: string;
    parameters?: { $ref?: string; name?: string }[];
    requestBody?: unknown;
    responses?: Record<string, { description?: string }>;
}

/** A module's contract fragment, as far as these checks read it. */
interface Fragment {
    'x-error-codes'?: Record<string, unknown>;
    paths?: Record<string, Record<string, OperationNode>>;
    components?: { schemas?: Record<string, SchemaNode> };
}

/** The HTTP methods an operation object may be keyed by. */
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

/** Every module that publishes a contract fragment, parsed. */
const contracts = readdirSync(MODULES_ROOT)
    .map((module) => ({ module, file: path.join(MODULES_ROOT, module, 'openapi.yaml') }))
    .filter(({ file }) => existsSync(file))
    .map(({ module, file }) => ({
        module,
        // `yaml` parses to `any`; the cast narrows it to the slice this file reads.
        fragment: YAML.parse(readFileSync(file, 'utf8')) as Fragment
    }));

/**
 * The values a schema's enum lists, following a local `$ref` and an `allOf` wrapper.
 * @param fragment - the fragment the schema sits in
 * @param node - the schema node to resolve
 */
const enumValues = (fragment: Fragment, node: SchemaNode | undefined): unknown[] => {
    if (!node) return [];
    if (node.enum) return node.enum;
    if (node.allOf) return node.allOf.flatMap((part) => enumValues(fragment, part));
    const prefix = '#/components/schemas/';
    return node.$ref?.startsWith(prefix)
        ? enumValues(fragment, fragment.components?.schemas?.[node.$ref.slice(prefix.length)])
        : [];
};

/**
 * Every `.ts` file under a folder, tests excluded.
 * @param directory - the folder to walk
 */
const sourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const entryPath = path.join(directory, entry);
        if (statSync(entryPath).isDirectory())
            return entry === 'tests' ? [] : sourceFiles(entryPath);
        return entryPath.endsWith('.ts') ? [entryPath] : [];
    });

/**
 * The text of the call starting at `start`, to its closing parenthesis.
 * @param source - the file's text
 * @param start - where the call's name begins
 */
const callText = (source: string, start: number): string => {
    let depth = 0;
    for (let index = source.indexOf('(', start); index < source.length; index++) {
        if (source[index] === '(') depth++;
        if (source[index] === ')' && --depth === 0) return source.slice(start, index + 1);
    }
    return source.slice(start);
};

/**
 * Whether an operation lets the caller sort: a `sort` query parameter, or a `sort` property on
 * its search body.
 * @param operation - the operation
 * @param fragment - the fragment it sits in
 */
const takesSort = (operation: OperationNode, fragment: Fragment): boolean => {
    if ((operation.parameters ?? []).some((parameter) => parameter.name === 'sort')) return true;
    const body = /Search\w+Request/.exec(JSON.stringify(operation.requestBody ?? {}));
    return Boolean(body && fragment.components?.schemas?.[body[0]]?.properties?.sort);
};

/**
 * A module's presenter files: `presenter.ts`, or `presenters.ts` for a module presenting more
 * than one resource.
 * @param module - the module folder
 */
const presenterFiles = (module: string): string[] =>
    readdirSync(path.join(MODULES_ROOT, module))
        .filter((file) => /^presenters?\.ts$/.test(file))
        .map((file) => path.join(MODULES_ROOT, module, file));

describe('a resource with a lifecycle status publishes required actions', () => {
    /**
     * Schemas that carry a `status` enum without being a record a caller acts on: a request body,
     * a personal-data export row (`actions` never travels in an export), a health read.
     */
    const NOT_A_RECORD = /^(Search|Export|Update|Create|Observability)/;

    /**
     * Records that carry a status and still publish no `actions`, with the reason. The staleness
     * case below refuses an entry that has since published them.
     */
    const EXEMPT: Record<string, string> = {
        'feedback.FeedbackRequest':
            'replaced by `Ticket` (with its own required actions) in lane staff-tickets-core',
        'delivery.PreorderFulfillmentOrder':
            'a read-only row of the preorder board; every move is on `FulfillmentOrder`, one id away',
        'payments.Refund':
            'a line of its payment: refunds are moved through `PaymentActions` (settleByHand, cancelRefund)',
        'payments.RefundListItem':
            'a read-only log row of the Refunds tab; its moves are `PaymentActions` on the payment'
    };

    /** `module.Schema` of every record whose status has more than one value. */
    const lifecycleRecords = contracts.flatMap(({ module, fragment }) =>
        Object.entries(fragment.components?.schemas ?? {})
            .filter(
                ([name, schema]) =>
                    !NOT_A_RECORD.test(name) &&
                    schema.properties?.status &&
                    enumValues(fragment, schema.properties.status).length > 1
            )
            .map(([name, schema]) => ({ id: `${module}.${name}`, schema }))
    );

    it('finds the records it means to check', () => {
        // A canary: a changed fragment layout would leave the sweep empty and passing.
        // Floors are what the foundation modules alone clear, so the sweep also holds with the shop stripped.
        expect(lifecycleRecords.length).toBeGreaterThanOrEqual(3);
    });

    it('lists `actions` in `required` on every one', () => {
        const missing = lifecycleRecords
            .filter(({ id }) => !(id in EXEMPT))
            .filter(
                ({ schema }) => !schema.properties?.actions || !schema.required?.includes('actions')
            )
            .map(({ id }) => id);

        expect(missing).toEqual([]);
    });

    it('keeps no exemption that has since published required actions', () => {
        const stale = lifecycleRecords
            .filter(({ id }) => id in EXEMPT)
            .filter(({ schema }) => schema.required?.includes('actions'))
            .map(({ id }) => id);

        expect(stale).toEqual([]);
    });
});

describe('presenters', () => {
    /** The module folders that serve HTTP and own a model. */
    const presentingModules = readdirSync(MODULES_ROOT).filter(
        (module) =>
            existsSync(path.join(MODULES_ROOT, module, 'model.ts')) &&
            existsSync(path.join(MODULES_ROOT, module, 'routes.ts'))
    );

    /** What a presenter must not know about: who is asking, or a service that decides. */
    const FORBIDDEN_IMPORT = /@kernel\/ability|\bAuthContext\b|\bCaller\b|\b\w+Service\b/;

    it('exists in every module that serves HTTP and owns a model', () => {
        expect(presentingModules.length).toBeGreaterThanOrEqual(1);
        expect(presentingModules.filter((module) => presenterFiles(module).length === 0)).toEqual(
            []
        );
    });

    it('imports no ability, auth context, caller or service', () => {
        const offenders = presentingModules
            .flatMap((module) => presenterFiles(module))
            .flatMap((file) =>
                [...readFileSync(file, 'utf8').matchAll(/^import\b[^;]*;/gm)]
                    .map(([statement]) => statement.replaceAll(/\s+/g, ' '))
                    .filter((statement) => FORBIDDEN_IMPORT.test(statement))
                    .map((statement) => `${path.relative(REPO_ROOT, file)}: ${statement}`)
            );

        expect(offenders).toEqual([]);
    });
});

describe('a 409 refusal carries an error code', () => {
    /** The calls that build a 409 answer. */
    const CALL = /\b(?:generateReject|refuse)\(\s*409\b|\brejectResponse\([^(),]+,\s*409\b/g;

    /** Every 409 call in the source, with where it is. */
    const refusals = sourceFiles(path.join(REPO_ROOT, 'src')).flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return [...source.matchAll(CALL)].map((match) => ({
            where: `${path.relative(REPO_ROOT, file)}:${source.slice(0, match.index).split('\n').length}`,
            text: callText(source, match.index)
        }));
    });

    it('finds the refusals it means to check', () => {
        expect(refusals.length).toBeGreaterThanOrEqual(20);
    });

    it('names a code at every one (a bare message cannot be told apart by a client)', () => {
        const bare = refusals
            .filter(({ text }) => !/\bcode\s*[,:}]|\bERROR_CODES\b/.test(text))
            .map(({ where }) => where);

        expect(bare).toEqual([]);
    });

    it('lists every named code in a contract fragment', () => {
        // The shared root contract holds the codes no module owns (idempotency, rate limits).
        const root = YAML.parse(
            readFileSync(path.join(REPO_ROOT, 'shared', 'contracts', 'openapi.root.yaml'), 'utf8')
        ) as Fragment;
        const declared = new Set(
            [...contracts.map(({ fragment }) => fragment), root].flatMap((fragment) =>
                Object.keys(fragment['x-error-codes'] ?? {})
            )
        );
        const used = new Set(
            refusals.flatMap(({ text }) =>
                [...text.matchAll(/ERROR_CODES\.(\w+)/g)].map(([, code]) => code)
            )
        );

        expect([...used].filter((code) => !declared.has(code))).toEqual([]);
    });
});

describe('a paged list takes `sort` or states its one fixed order', () => {
    /** What a fixed-order list says in its 200 description, as `docs/api/sorting.md` names the kinds. */
    const FIXED_ORDER = /\((?:a log|a queue|a dictionary), so no `sort`\)/;

    /** Every paged operation: one that takes `page`, or one that searches by body. */
    const paged = contracts.flatMap(({ module, fragment }) =>
        Object.entries(fragment.paths ?? {}).flatMap(([route, item]) =>
            Object.entries(item)
                .filter(([method]) => METHODS.has(method))
                .filter(
                    ([, operation]) =>
                        (operation.parameters ?? []).some((parameter) =>
                            (parameter.$ref ?? parameter.name ?? '').endsWith('PageParam')
                        ) || /Search\w+Request/.test(JSON.stringify(operation.requestBody ?? {}))
                )
                .map(([method, operation]) => ({
                    id: `${module}: ${method.toUpperCase()} ${route}`,
                    operation,
                    fragment
                }))
        )
    );

    it('finds the paged operations it means to check', () => {
        expect(paged.length).toBeGreaterThanOrEqual(10);
    });

    it('gives each a `sort` or a stated fixed order', () => {
        const unsorted = paged
            .filter(({ operation, fragment }) => !takesSort(operation, fragment))
            .filter(
                ({ operation }) =>
                    !FIXED_ORDER.test(operation.responses?.['200']?.description ?? '')
            )
            .map(({ id }) => id);

        expect(unsorted).toEqual([]);
    });

    it('names the kinds of fixed order in docs/api/sorting.md', () => {
        const page = readFileSync(path.join(REPO_ROOT, 'docs', 'api', 'sorting.md'), 'utf8');

        expect(page).toMatch(/\| log \|/);
        expect(page).toMatch(/\| queue \|/);
        expect(page).toMatch(/\| dictionary \|/);
    });
});
