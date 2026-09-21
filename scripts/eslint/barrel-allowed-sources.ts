/**
 * A module's barrel may only `export *` its services, domain rules, events and emails as values,
 * and its model as TYPES ONLY — never a repository, the model's runtime VALUE, or a wiring file,
 * in ANY export form. See docs/theory/strategic-ddd.md §5.
 *
 * Checked forms:
 * - `export * from './x'` / `export type * from './x'` — against the two allowlists below.
 * - `export { x } from './y'` — same allowlists, plus a named pick from `tax`, PRODUCTS' barrel
 *   only (its own VAT lookup) — see `products/index.ts`'s own comment. `factories` is never
 *   allowed from any barrel — CLAUDE.md's own rule — and `factoriesImportPattern`
 *   (`no-restricted-imports` in `eslint.config.ts`) already refuses that import categorically, so
 *   this rule does not need its own allowance for it, dead or otherwise. A named pick from
 *   `./model` is checked by NAME instead: a pure helper is fine, the schema, its transform or the
 *   model object are not — see `isModelRuntimeValueName`.
 * - `import { x } from './y'; export { x };` — resolved through this file's own import map,
 *   since the export itself carries no source.
 */

import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

/** `RuleCreator`'s two type parameters: this rule takes no options and reports five messages. */
type Options = [];
type MessageIds =
    | 'notAllowed'
    | 'modelAsValue'
    | 'modelNamedValue'
    | 'repositoryExport'
    | 'wiringExport';

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
 * This rule only ever lints a module's `index.ts` (see its registration in `eslint.config.ts`),
 * at whatever absolute path this checkout lives at — `(?:^|[/\\])` so the leading separator is
 * optional, since a test's own `filename` is a bare relative path with none before `src`.
 */
const MODULE_BARREL_PATH = /(?:^|[/\\])src[/\\]modules[/\\]([^/\\]+)[/\\]index\.ts$/;

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

/** Flags a module barrel `export` naming a file this module's `index.ts` may not publish. */
export const barrelAllowedSources = ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
    meta: {
        type: 'problem',
        docs: {
            description: "A barrel may only publish the files this module's index.ts is allowed to"
        },
        schema: [],
        messages: {
            notAllowed:
                '{{declaration}} is not one of the files a barrel may publish — services, domain, ' +
                'events and emails as values, model as `export type *` only, plus (products only) ' +
                'a named pick from tax. See docs/theory/strategic-ddd.md §5.',
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
    defaultOptions: [],
    create(context) {
        /** local name → source stem, for `import { x } from './y'; export { x };`. */
        const importSourceOf = new Map<string, string>();

        // `tax` is products' own VAT lookup — a named pick from it is allowed from THIS barrel
        // only, never from a sibling's, which the module name captured off the file path decides.
        const isProductsBarrel = MODULE_BARREL_PATH.exec(context.filename)?.[1] === 'products';

        const declarationText = (node: TSESTree.Node): string => context.sourceCode.getText(node);

        const reportSource = (
            node: TSESTree.Node,
            reportNode: TSESTree.Node,
            stem: string
        ): boolean => {
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
        const reportModelNamedValuePicks = (
            node: TSESTree.Node,
            specifiers: readonly TSESTree.ExportSpecifier[]
        ): void => {
            for (const specifier of specifiers) {
                if (specifier.local.type !== AST_NODE_TYPES.Identifier) continue;
                if (!isModelRuntimeValueName(specifier.local.name)) continue;
                context.report({
                    node: specifier,
                    messageId: 'modelNamedValue',
                    data: { declaration: declarationText(node), name: specifier.local.name }
                });
            }
        };

        return {
            Program(node) {
                for (const statement of node.body) {
                    if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue;
                    const stem = sourceStem(statement.source.value);
                    // `local` is always an `Identifier` on every import specifier form.
                    for (const specifier of statement.specifiers)
                        importSourceOf.set(specifier.local.name, stem);
                }
            },

            ExportAllDeclaration(node) {
                const stem = sourceStem(node.source.value);
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

            ExportNamedDeclaration(node) {
                if (node.source) {
                    const stem = sourceStem(node.source.value);
                    if (reportSource(node, node.source, stem)) return;

                    const isTypeOnly = node.exportKind === 'type';
                    if (stem === 'model') {
                        if (!isTypeOnly) reportModelNamedValuePicks(node, node.specifiers);
                        return;
                    }

                    if (VALUE_SOURCES.has(stem)) return;
                    if (stem === 'tax' && isProductsBarrel) return;

                    context.report({
                        node: node.source,
                        messageId: 'notAllowed',
                        data: { declaration: declarationText(node) }
                    });
                    return;
                }

                // No source: `export { x }` re-exporting something imported earlier in this
                // file — `local` is always an `Identifier` on this form.
                for (const specifier of node.specifiers) {
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
});
