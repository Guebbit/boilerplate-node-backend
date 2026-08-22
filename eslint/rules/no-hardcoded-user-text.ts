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

const CARRIERS = new Set(['rejectResponse', 'generateReject']);

/** A string literal, or a template with no expressions — both are hardcoded copy. */
const isLiteralText = (node: any): boolean =>
    (node?.type === 'Literal' && typeof node.value === 'string') ||
    (node?.type === 'TemplateLiteral' && node.expressions.length === 0);

export const noHardcodedUserText = {
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
    create(context: any) {
        return {
            CallExpression(node: any) {
                const callee = node.callee?.type === 'Identifier' ? node.callee.name : undefined;
                if (!callee || !CARRIERS.has(callee)) return;

                const errors = node.arguments.find(
                    (argument: any) => argument?.type === 'ArrayExpression'
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
                    if (element?.type !== 'ObjectExpression') continue;
                    for (const property of element.properties) {
                        const key = property?.key;
                        const isMessage =
                            (key?.type === 'Identifier' && key.name === 'message') ||
                            (key?.type === 'Literal' && key.value === 'message');
                        if (isMessage && isLiteralText(property.value))
                            context.report({
                                node: property.value,
                                messageId: 'literal',
                                data: { callee }
                            });
                    }
                }
            }
        };
    }
};
