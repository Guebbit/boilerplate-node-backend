/**
 * A promise chain started in a controller must end in `.catch()`.
 *
 * The global handler in `app.ts` answers a client-shaped status for an unhandled rejection,
 * so a missing `.catch()` usually looks right — until it does not: `POST /orders` with a
 * malformed `productId` answered 500 for exactly this reason, an ordinary bad request
 * reported as a server fault. The net also cannot clean up (an upload from a failed write
 * stays orphaned) or record a domain metric (a failed checkout still needs its counter).
 */

import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

type Options = [];
type MessageIds = 'missing';

/** Looks up a node's parent — TSESTree does not type a bare `.parent` link, so this is built once
 * per visited call from `context.sourceCode.getAncestors()`, which does. */
type ParentOf = (node: TSESTree.Node) => TSESTree.Node | undefined;

/** The method names of a chain, read from its outermost call inwards. */
const chainMethods = (call: TSESTree.Node): string[] => {
    const names: string[] = [];
    let current = call;
    while (
        current.type === AST_NODE_TYPES.CallExpression &&
        current.callee.type === AST_NODE_TYPES.MemberExpression
    ) {
        const { property, object } = current.callee;
        if (property.type === AST_NODE_TYPES.Identifier) names.push(property.name);
        current = object;
    }
    return names;
};

const HANDLER_METHODS = new Set(['then', 'catch', 'finally']);

const isPromiseCallbackFunction = (
    node: TSESTree.Node
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression =>
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression;

/**
 * Is this chain already governed by an outer chain's `.catch()`?
 *
 * A chain written INSIDE a promise handler — the cleanup in
 * `.catch((error) => deleteUpload().then(...))`, or a guard's
 * `return deleteUpload().then(...)` inside a `.then` — rejects into the chain that
 * owns the callback. Reporting it would be asking for a `.catch()` on something that
 * already has one, which is how a rule teaches people to silence it.
 */
const insidePromiseHandler = (node: TSESTree.Node, parentOf: ParentOf): boolean => {
    let current = parentOf(node);
    while (current) {
        const parent = parentOf(current);
        if (
            isPromiseCallbackFunction(current) &&
            parent?.type === AST_NODE_TYPES.CallExpression &&
            parent.callee.type === AST_NODE_TYPES.MemberExpression &&
            parent.callee.property.type === AST_NODE_TYPES.Identifier &&
            HANDLER_METHODS.has(parent.callee.property.name)
        )
            return true;
        current = parent;
    }
    return false;
};

const isEnclosingFunction = (
    node: TSESTree.Node
): node is
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration =>
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration;

/** Two `.parent` hops up from a `const`'s `VariableDeclarator`: the `VariableDeclaration`, then whatever holds it. */
const grandparentOf = (
    node: TSESTree.Node | undefined,
    parentOf: ParentOf
): TSESTree.Node | undefined => {
    const parent = node && parentOf(node);
    return parent && parentOf(parent);
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
const insideExportedFunction = (node: TSESTree.Node, parentOf: ParentOf): boolean => {
    let outermostFunction: TSESTree.Node | undefined;
    let current = parentOf(node);
    while (current) {
        if (isEnclosingFunction(current)) outermostFunction = current;
        current = parentOf(current);
    }
    if (!outermostFunction) return false;

    const functionParent = parentOf(outermostFunction);
    const owner =
        functionParent?.type === AST_NODE_TYPES.VariableDeclarator
            ? grandparentOf(functionParent, parentOf)
            : functionParent;
    return (
        owner?.type === AST_NODE_TYPES.ExportNamedDeclaration ||
        owner?.type === AST_NODE_TYPES.ExportDefaultDeclaration
    );
};

export const controllerChainMustCatch = ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
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
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                // Built once per visited call: `getAncestors` gives the chain from Program down
                // to `node`'s own immediate parent, in order — consecutive pairs are exactly the
                // `.parent` links TSESTree does not type.
                const chain = [...context.sourceCode.getAncestors(node), node];
                const parents = new Map<TSESTree.Node, TSESTree.Node>(
                    chain.slice(1).map((child, index) => [child, chain[index]])
                );
                const parentOf: ParentOf = (target) => parents.get(target);

                // Only judge the OUTERMOST call of a chain: an inner `.then` is part of the
                // same expression and would otherwise be reported a second time.
                const parent = parentOf(node);
                if (parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === node)
                    return;

                const methods = chainMethods(node);
                if (!methods.includes('then') || methods.includes('catch')) return;
                if (insidePromiseHandler(node, parentOf)) return;
                if (!insideExportedFunction(node, parentOf)) return;

                context.report({ node, messageId: 'missing' });
            }
        };
    }
});
