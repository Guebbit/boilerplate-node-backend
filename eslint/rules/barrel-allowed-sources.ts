/**
 * A module's barrel may only `export *` from its services, domain rules, events and emails as
 * values, and its model as TYPES ONLY. Everything else — a repository, the model as a value,
 * routes, controllers, the manifest, probes, metrics, analytics, audit — is a persistence handle
 * or wiring, and the deny-list only holds if nothing can re-open it through a new `export *`
 * nobody reads closely.
 *
 * Scoped to `export *` / `export type *` specifically: a named `export { x } from './y'` already
 * says what it publishes, so there is nothing structural to check there. This rule is only about
 * the form that publishes EVERYTHING a file has, sight unseen — see
 * `docs/theory/strategic-ddd.md` §5.
 */

/** Value files a barrel may `export *` from. */
const VALUE_SOURCES = new Set(['services', 'service', 'domain', 'events', 'emails']);

/** The same, plus `model` — reachable, but types only. */
const TYPE_SOURCES = new Set([...VALUE_SOURCES, 'model']);

/** `./model` → `model`; the check is about the file, not how it was spelled. */
const sourceStem = (specifier: string): string => specifier.replace(/^\.\//, '');

export const barrelAllowedSources = {
    meta: {
        type: 'problem',
        docs: { description: "A barrel's `export *` only reaches the files B1 allows" },
        schema: [],
        messages: {
            notAllowed:
                "`export * from '{{source}}'` is not one of the files a barrel may publish " +
                'everything from — services, domain, events and emails as values, model as ' +
                '`export type *` only. See docs/theory/strategic-ddd.md §5.',
            modelAsValue:
                "The model is published as types only — `export type * from './model'`, never " +
                "`export * from './model'`, which would also publish the mongoose schema and " +
                'the model object.'
        }
    },
    create(context: any) {
        return {
            ExportAllDeclaration(node: any) {
                const source = node.source?.value;
                if (typeof source !== 'string') return;

                const stem = sourceStem(source);
                const isTypeOnly = node.exportKind === 'type';

                if (isTypeOnly) {
                    if (!TYPE_SOURCES.has(stem))
                        context.report({
                            node: node.source,
                            messageId: 'notAllowed',
                            data: { source }
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
                        data: { source }
                    });
            }
        };
    }
};
