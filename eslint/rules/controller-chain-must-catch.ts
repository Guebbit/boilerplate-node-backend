/**
 * A promise chain started in a controller must end in `.catch()`.
 *
 * The global handler in `app.ts` answers a client-shaped status for an unhandled rejection,
 * so a missing `.catch()` usually looks right — until it does not: `POST /orders` with a
 * malformed `productId` answered 500 for exactly this reason, an ordinary bad request
 * reported as a server fault. The net also cannot clean up (an upload from a failed write
 * stays orphaned) or record a domain metric (a failed checkout still needs its counter).
 */

/** The method names of a chain, read from its outermost call inwards. */
const chainMethods = (call: any): string[] => {
    const names: string[] = [];
    let current = call;
    while (current?.type === 'CallExpression' && current.callee?.type === 'MemberExpression') {
        const { property, object } = current.callee;
        if (property?.type === 'Identifier') names.push(property.name);
        current = object;
    }
    return names;
};

const HANDLER_METHODS = new Set(['then', 'catch', 'finally']);

/**
 * Is this chain already governed by an outer chain's `.catch()`?
 *
 * A chain written INSIDE a promise handler — the cleanup in
 * `.catch((error) => deleteUpload().then(...))`, or a guard's
 * `return deleteUpload().then(...)` inside a `.then` — rejects into the chain that
 * owns the callback. Reporting it would be asking for a `.catch()` on something that
 * already has one, which is how a rule teaches people to silence it.
 */
const insidePromiseHandler = (node: any): boolean => {
    let current = node.parent;
    while (current) {
        const isFunction =
            current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression';
        const { parent } = current;
        if (
            isFunction &&
            parent?.type === 'CallExpression' &&
            parent.callee?.type === 'MemberExpression' &&
            parent.callee.property?.type === 'Identifier' &&
            HANDLER_METHODS.has(parent.callee.property.name)
        )
            return true;
        current = parent;
    }
    return false;
};

/**
 * Is the enclosing function the module's exported handler?
 *
 * Only that one owes the chain a `.catch()`, and the reason is who calls it: Express,
 * which does nothing with a returned promise. A private helper that returns its chain
 * is delegating to its caller — `post-reset-request.ts` does exactly this, and the
 * caller's `.catch` is deliberately the one that swallows, to keep the response
 * identical for a known and an unknown email.
 */
const insideExportedFunction = (node: any): boolean => {
    let outermostFunction;
    let current = node.parent;
    while (current) {
        if (
            current.type === 'ArrowFunctionExpression' ||
            current.type === 'FunctionExpression' ||
            current.type === 'FunctionDeclaration'
        )
            outermostFunction = current;
        current = current.parent;
    }
    if (!outermostFunction) return false;

    const owner =
        outermostFunction.parent?.type === 'VariableDeclarator'
            ? outermostFunction.parent.parent?.parent
            : outermostFunction.parent;
    return owner?.type === 'ExportNamedDeclaration' || owner?.type === 'ExportDefaultDeclaration';
};

export const controllerChainMustCatch = {
    meta: {
        type: 'problem',
        docs: { description: 'Promise chains in controllers must end in .catch()' },
        schema: [],
        messages: {
            missing:
                'This promise chain has no .catch(). The global error handler is a net, not a ' +
                'substitute: it cannot clean up after the failure or record the domain metric.'
        }
    },
    create(context: any) {
        return {
            CallExpression(node: any) {
                // Only judge the OUTERMOST call of a chain: an inner `.then` is part of the
                // same expression and would otherwise be reported a second time.
                const { parent } = node;
                if (parent?.type === 'MemberExpression' && parent.object === node) return;

                const methods = chainMethods(node);
                if (!methods.includes('then') || methods.includes('catch')) return;
                if (insidePromiseHandler(node)) return;
                if (!insideExportedFunction(node)) return;

                context.report({ node, messageId: 'missing' });
            }
        };
    }
};
