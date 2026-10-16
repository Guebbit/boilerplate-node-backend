/**
 * Persistence stays behind the repository — the import is where that stops being true.
 *
 * A collection has exactly one door, `repository.ts`. Every other file that reaches past it is a
 * second door.
 *
 * Checks:       by NAME (the imported binding, even renamed) and by PATH (the specifier).
 * `import type`: counts. The type IS the schema, and the coupling survives erasure.
 * Options:      suffixes and the path check are per layer. Defaults are the strict reading.
 *
 * Why two checks, why types count: docs/theory/layers.md#persistence-behind-the-repository
 */

import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

/** This rule's one config block: which name suffixes count, and whether the path check runs. */
export interface RuleOptions {
    bindings?: string[];
    paths?: boolean;
}

/** `RuleCreator`'s two type parameters: one optional {@link RuleOptions} block, two messages. */
type Options = [RuleOptions?];

/** The two messages this rule reports: a forbidden imported name, and a forbidden module path. */
type MessageIds = 'binding' | 'path';

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
const specifierNames = (specifier: TSESTree.ImportClause): string[] => {
    const names = [specifier.local.name];
    if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.imported.type === AST_NODE_TYPES.Identifier
    )
        names.push(specifier.imported.name);
    return names;
};

/** Flags an import that reaches a collection's model or repository from outside its own door. */
export const noPersistenceImports = ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
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
    defaultOptions: [{}],
    create(context) {
        const options = context.options[0] ?? {};
        const bindings: string[] = options.bindings ?? DEFAULT_BINDINGS;
        const checkPaths: boolean = options.paths ?? true;

        return {
            ImportDeclaration(node) {
                const source = node.source.value;

                // The path verdict is about the whole declaration, so it is reported once and
                // the name check is skipped — `import { userModel } from './model'` is one
                // mistake, not two, and two reports on one line is how a rule gets disabled.
                if (checkPaths && PERSISTENCE_PATH.test(source)) {
                    context.report({ node: node.source, messageId: 'path', data: { source } });
                    return;
                }

                if (bindings.length === 0) return;

                for (const specifier of node.specifiers) {
                    const name = specifierNames(specifier).find((candidate) =>
                        bindings.some((suffix) => candidate.endsWith(suffix))
                    );
                    if (name)
                        context.report({ node: specifier, messageId: 'binding', data: { name } });
                }
            }
        };
    }
});
