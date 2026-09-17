/**
 * A module's barrel may only `export *` its services, domain rules, events and emails as values,
 * and its model as TYPES ONLY — never a repository, the model's runtime VALUE, or a wiring file,
 * in ANY export form. See docs/theory/strategic-ddd.md §5.
 *
 * Checked forms:
 * - `export * from './x'` / `export type * from './x'` — against the two allowlists below.
 * - `export { x } from './y'` — same allowlists, plus a named pick from `factories` or (products
 *   only) `tax`, published deliberately per-module — see each barrel's own comment. A named pick
 *   from `./model` is checked by NAME instead: a pure helper is fine, the schema, its transform
 *   or the model object are not — see `isModelRuntimeValueName`.
 * - `import { x } from './y'; export { x };` — resolved through this file's own import map,
 *   since the export itself carries no source.
 */

/** A write handle on a collection this module does not own once published — no exception. */
const isRepositorySource = (stem: string): boolean => stem === 'repository';

/** Routes, the manifest, controllers, probes, metrics, analytics, audit — wiring, not surface. */
const isWiringSource = (stem: string): boolean =>
    ['routes', 'module', 'probes', 'metrics', 'analytics', 'audit'].includes(stem) ||
    stem === 'controllers' ||
    stem.startsWith('controllers/');

/** Value files a barrel may `export *` from, or name-pick from `export { x } from './y'`. */
const VALUE_SOURCES = new Set(['services', 'service', 'domain', 'events', 'emails']);

/** The same, plus `model` — reachable, but types only. */
const TYPE_SOURCES = new Set([...VALUE_SOURCES, 'model']);

/**
 * Extra sources a barrel may NAME-PICK from — never `export *`, since that publishes everything
 * a file has: `factories` (a fixture for a sibling's own tests) and `tax` (products' VAT lookup).
 */
const NAMED_EXTRA_SOURCES = new Set(['factories', 'tax']);

/**
 * A mongoose schema, its `toJSON` transform, or the model object itself — the three shapes a
 * named pick from `./model` must never carry, matched on this repo's own naming convention
 * (`<name>Schema`, `apply<Name>Transform`, `<name>Model`; see any `model.ts`). A Zod validation
 * schema is not a runtime value and is always named `zod<Name>Schema`, so it is carved out
 * explicitly rather than matched — `users/index.ts` names `zodUserSchema` this way on purpose.
 */
const isModelRuntimeValueName = (name: string): boolean =>
    (name.endsWith('Schema') && !name.toLowerCase().startsWith('zod')) ||
    /^apply.*Transform$/.test(name) ||
    name.endsWith('Model');

/** './model' → 'model'; './services/index' → 'services' too — about the file, not the spelling. */
const sourceStem = (specifier: string): string =>
    specifier.replace(/^\.\//, '').replace(/\/index$/, '');

export const barrelAllowedSources = {
    meta: {
        type: 'problem',
        docs: {
            description: "A barrel may only publish the files this module's index.ts is allowed to"
        },
        schema: [],
        messages: {
            notAllowed:
                '{{declaration}} is not one of the files a barrel may publish — services, domain, ' +
                'events and emails as values, model as `export type *` only, plus a named pick ' +
                'from factories or (products only) tax. See docs/theory/strategic-ddd.md §5.',
            modelAsValue:
                "The model is published as types only — `export type * from './model'`, never " +
                "`export * from './model'`, which would also publish the mongoose schema and " +
                'the model object.',
            modelNamedValue:
                '{{declaration}} names `{{name}}`, which reads as the model’s runtime value by ' +
                'this repo’s naming convention (a mongoose schema, its `toJSON` transform, or the ' +
                'model object) — `export type *` already publishes its structure; a named pick ' +
                'stays to genuinely pure helpers. See docs/theory/strategic-ddd.md §5.',
            repositoryExport:
                '{{declaration}} publishes a repository — a write handle on a collection this ' +
                'module does not own once published. The service is the door, in every export ' +
                'form. See docs/theory/strategic-ddd.md §5.',
            wiringExport:
                '{{declaration}} publishes a wiring file — routes, controllers, the manifest, ' +
                'probes, metrics, analytics or audit are not the module’s public surface, in any ' +
                'export form. See docs/theory/strategic-ddd.md §5.'
        }
    },
    create(context: any) {
        /** local name → source stem, for `import { x } from './y'; export { x };`. */
        const importSourceOf = new Map<string, string>();

        const declarationText = (node: any): string => context.sourceCode.getText(node);

        const reportSource = (node: any, reportNode: any, stem: string): boolean => {
            if (isRepositorySource(stem)) {
                context.report({
                    node: reportNode,
                    messageId: 'repositoryExport',
                    data: { declaration: declarationText(node) }
                });
                return true;
            }
            if (isWiringSource(stem)) {
                context.report({
                    node: reportNode,
                    messageId: 'wiringExport',
                    data: { declaration: declarationText(node) }
                });
                return true;
            }
            return false;
        };

        /** A named `./model` pick reports individually — `export type *` already covers structure. */
        const reportModelNamedValuePicks = (node: any, specifiers: any[]): void => {
            for (const specifier of specifiers) {
                if (!isModelRuntimeValueName(specifier.local.name)) continue;
                context.report({
                    node: specifier,
                    messageId: 'modelNamedValue',
                    data: { declaration: declarationText(node), name: specifier.local.name }
                });
            }
        };

        return {
            Program(node: any) {
                for (const statement of node.body) {
                    if (statement.type !== 'ImportDeclaration') continue;
                    const source = statement.source?.value;
                    if (typeof source !== 'string') continue;
                    const stem = sourceStem(source);
                    for (const specifier of statement.specifiers ?? []) {
                        if (specifier.local?.type === 'Identifier')
                            importSourceOf.set(specifier.local.name, stem);
                    }
                }
            },

            ExportAllDeclaration(node: any) {
                const source = node.source?.value;
                if (typeof source !== 'string') return;

                const stem = sourceStem(source);
                if (reportSource(node, node.source, stem)) return;

                const isTypeOnly = node.exportKind === 'type';
                if (isTypeOnly) {
                    if (!TYPE_SOURCES.has(stem))
                        context.report({
                            node: node.source,
                            messageId: 'notAllowed',
                            data: { declaration: declarationText(node) }
                        });
                    return;
                }

                if (stem === 'model') {
                    context.report({ node: node.source, messageId: 'modelAsValue' });
                    return;
                }

                if (!VALUE_SOURCES.has(stem))
                    context.report({
                        node: node.source,
                        messageId: 'notAllowed',
                        data: { declaration: declarationText(node) }
                    });
            },

            ExportNamedDeclaration(node: any) {
                const source = node.source?.value;

                if (typeof source === 'string') {
                    const stem = sourceStem(source);
                    if (reportSource(node, node.source, stem)) return;

                    const isTypeOnly = node.exportKind === 'type';
                    if (stem === 'model') {
                        if (!isTypeOnly) reportModelNamedValuePicks(node, node.specifiers ?? []);
                        return;
                    }

                    if (VALUE_SOURCES.has(stem) || NAMED_EXTRA_SOURCES.has(stem)) return;

                    context.report({
                        node: node.source,
                        messageId: 'notAllowed',
                        data: { declaration: declarationText(node) }
                    });
                    return;
                }

                // No source: `export { x }` re-exporting something imported earlier in this file.
                for (const specifier of node.specifiers ?? []) {
                    const stem = importSourceOf.get(specifier.local.name);
                    if (stem === undefined) continue;
                    if (reportSource(node, specifier, stem)) continue;
                    if (stem === 'model' && isModelRuntimeValueName(specifier.local.name))
                        context.report({
                            node: specifier,
                            messageId: 'modelNamedValue',
                            data: {
                                declaration: declarationText(node),
                                name: specifier.local.name
                            }
                        });
                }
            }
        };
    }
};
