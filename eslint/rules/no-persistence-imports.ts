/**
 * Persistence stays behind the repository — the import is where that stops being true.
 *
 * A collection has exactly one door: `repository.ts`, which owns the query shapes and the
 * mapping from documents to plain data. Every other file that reaches past it is a second
 * door, and a second door is why a field rename in `model.ts` turns into a hunt through
 * callers, why a lean/hydrated mix-up survives review, and why `orderModel.updateOne` ends up
 * running from a service with none of the repository's guards around it.
 *
 * ── Why two checks and not one ────────────────────────────────────────────────────────────
 * The violations arrive by two different routes and neither one sees the other:
 *
 *   1. **By name.** `import { userRepository } from '@modules/users'` comes through a module's
 *      barrel, so the specifier says `@modules/users` and nothing else — the path is innocent
 *      and only the binding gives it away. `import { userModel as Users }` is the same import
 *      wearing a hat, so the check reads the IMPORTED name as well as the local one; renaming
 *      the binding is not a way out of a rule about what was reached for.
 *   2. **By path.** `import type { UserRecord } from '../model'` names nothing suspicious —
 *      `UserRecord` matches no suffix — but the file it comes from is the schema. Only the
 *      specifier can catch this one.
 *
 * ── `import type` counts ──────────────────────────────────────────────────────────────────
 * A type-only import erases at runtime, which is exactly the argument for letting it through
 * and exactly why it is not made here. The type IS the schema: a layer that names
 * `UserDocument` has the storage layout in its signatures, changes when the collection
 * changes, and is no longer describable without mongoose. The coupling this rule is about is
 * the one that survives erasure.
 *
 * ── Configurable, because "too close to storage" is a per-layer verdict ───────────────────
 * A service holding a repository is the intended design; a controller holding one is a tier
 * violation. So the suffixes and the path check are options rather than constants, and the
 * config states each layer's answer next to the reason for it. Defaults are the strict
 * reading — a rule switched on with no options should not quietly be the lax one.
 */

/** The strict reading, used when a config block turns the rule on without saying more. */
const DEFAULT_BINDINGS = ['Repository', 'Model'];

/**
 * A specifier whose last segment IS the persistence file: `../model`, `./repository`,
 * `@modules/users/model`. Anchored on a segment boundary on purpose —
 * `@infrastructure/persistence/base-repository` is the shared helper every repository is built
 * from, not a collection's door, and a bare `endsWith('repository')` would report it.
 */
const PERSISTENCE_PATH = /(^|\/)(model|repository)$/;

/**
 * Every name an import specifier reaches for: what was exported, and what it is called here.
 * Both matter — `userModel as Users` hides the first behind the second.
 */
const specifierNames = (specifier: any): string[] => {
    const names: string[] = [];
    if (specifier?.imported?.type === 'Identifier') names.push(specifier.imported.name);
    if (specifier?.local?.type === 'Identifier') names.push(specifier.local.name);
    return names;
};

export const noPersistenceImports = {
    meta: {
        type: 'problem',
        docs: { description: 'Persistence handles and schema files stay behind the repository' },
        schema: [
            {
                type: 'object',
                properties: {
                    bindings: {
                        type: 'array',
                        items: { type: 'string' },
                        uniqueItems: true
                    },
                    paths: { type: 'boolean' }
                },
                additionalProperties: false
            }
        ],
        messages: {
            binding:
                '`{{name}}` is a persistence handle, and this file is not allowed to hold one. ' +
                'Every holder is another door to the collection: the repository stops being the ' +
                'single place a query shape can change, and the next schema edit has to find ' +
                'them all.',
            path:
                'Importing from `{{source}}` puts the collection’s storage shape in a file that ' +
                'does not store anything — this layer then changes every time the schema does. ' +
                '`import type` is not a way around it: the type IS the schema, so the coupling ' +
                'outlives the erasure. Take the plain data the repository returns.'
        }
    },
    create(context: any) {
        const options = context.options?.[0] ?? {};
        const bindings: string[] = options.bindings ?? DEFAULT_BINDINGS;
        const checkPaths: boolean = options.paths ?? true;

        return {
            ImportDeclaration(node: any) {
                const source = node.source?.value;

                // The path verdict is about the whole declaration, so it is reported once and
                // the name check is skipped — `import { userModel } from './model'` is one
                // mistake, not two, and two reports on one line is how a rule gets disabled.
                if (checkPaths && typeof source === 'string' && PERSISTENCE_PATH.test(source)) {
                    context.report({ node: node.source, messageId: 'path', data: { source } });
                    return;
                }

                if (bindings.length === 0) return;

                for (const specifier of node.specifiers ?? []) {
                    const name = specifierNames(specifier).find((candidate) =>
                        bindings.some((suffix) => candidate.endsWith(suffix))
                    );
                    if (name)
                        context.report({ node: specifier, messageId: 'binding', data: { name } });
                }
            }
        };
    }
};
