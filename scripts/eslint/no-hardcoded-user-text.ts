/**
 * User-facing copy comes from a dictionary, never from a literal at the call site.
 *
 * `rejectResponse(response, status, errors)` and `generateReject(status, errors)` carry the
 * only text a user reads — the envelope's own `message` is derived from the status by
 * `resolveErrorMessage` and cannot be passed. So this checks the `errors` argument, and
 * within it only the parts a user reads: a bare string element, or the `message:` of an error
 * object. `code:` identifiers, log lines, audit actions, span names and thrown `Error`
 * messages are technician-facing by convention and are not flagged.
 */

import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

/** `RuleCreator`'s two type parameters: this rule takes no options and reports one message. */
type Options = [];
type MessageIds = 'literal';

/** The two functions whose `errors` argument carries user-facing copy. */
const CARRIERS = new Set(['rejectResponse', 'generateReject']);

/** A string literal, or a template with no expressions — both are hardcoded copy. */
const isLiteralText = (
    node: TSESTree.Node | null | undefined
): node is TSESTree.StringLiteral | TSESTree.TemplateLiteral =>
    (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    (node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0);

/** Flags a hardcoded string where a `rejectResponse`/`generateReject` call needs a dictionary lookup. */
export const noHardcodedUserText = ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
    meta: {
        type: 'problem',
        docs: { description: 'User-facing error text must come from i18n, not a literal' },
        schema: [],
        messages: {
            literal:
                'User-facing text must come from a dictionary: use t(…) instead of a literal ' +
                'in the errors argument of {{callee}}().'
        }
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                const callee =
                    node.callee.type === AST_NODE_TYPES.Identifier ? node.callee.name : undefined;
                if (!callee || !CARRIERS.has(callee)) return;

                const errors = node.arguments.find(
                    (argument): argument is TSESTree.ArrayExpression =>
                        argument.type === AST_NODE_TYPES.ArrayExpression
                );
                if (!errors) return;

                for (const element of errors.elements) {
                    if (isLiteralText(element)) {
                        context.report({
                            node: element,
                            messageId: 'literal',
                            data: { callee }
                        });
                        continue;
                    }
                    if (element?.type !== AST_NODE_TYPES.ObjectExpression) continue;
                    for (const property of element.properties) {
                        if (property.type !== AST_NODE_TYPES.Property) continue;
                        const { key, value } = property;
                        const isMessage =
                            (key.type === AST_NODE_TYPES.Identifier && key.name === 'message') ||
                            (key.type === AST_NODE_TYPES.Literal && key.value === 'message');
                        if (isMessage && isLiteralText(value))
                            context.report({
                                node: value,
                                messageId: 'literal',
                                data: { callee }
                            });
                    }
                }
            }
        };
    }
});
