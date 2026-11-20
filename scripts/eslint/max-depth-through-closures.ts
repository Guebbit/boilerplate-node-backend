/**
 * Block nesting, counted THROUGH callbacks.
 *
 * ESLint's `max-depth` restarts at zero inside every function, so a `.then` callback or an
 * arrow passed to `.map` hides the depth the reader still carries. This rule keeps counting.
 *
 * Opens a level:  `if`, `for`, `for…in`, `for…of`, `while`, `do…while`, `switch`, `try`.
 *                 Only the body / branch / case / catch / finally sits one deeper; the
 *                 condition stays on the outer level, and an `else if` opens none of its own.
 * Carries depth:  arrow functions and function expressions add nothing and restart nothing.
 * Restarts at 0:  a function declaration, a class member (method, field, static block) and an
 *                 object-literal method, since those are named units a reader enters fresh.
 * Reports:        the first block past `max`, and nothing nested inside it.
 *
 * The same definition, line for line, as the PHP twin's `MaxNestingDepthRule`.
 *
 * @see docs/build/code-comments.md#nesting-depth
 */

import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

/** This rule's one config block: the deepest level a block may sit at. */
export interface RuleOptions {
    /** The deepest allowed level; the first block at `max + 1` is reported. */
    max?: number;
}

/** `RuleCreator`'s two type parameters: one optional {@link RuleOptions} block, one message. */
type Options = [RuleOptions?];

/** The one message this rule reports: a block nested past the limit. */
type MessageIds = 'tooDeep';

/** What production code gets when a config block turns the rule on without a number. */
const DEFAULT_MAX = 3;

/** Statements whose body, branch, case, catch or finally is one level deeper than the statement. */
const LEVEL_OPENERS = new Set<string>([
    AST_NODE_TYPES.IfStatement,
    AST_NODE_TYPES.ForStatement,
    AST_NODE_TYPES.ForInStatement,
    AST_NODE_TYPES.ForOfStatement,
    AST_NODE_TYPES.WhileStatement,
    AST_NODE_TYPES.DoWhileStatement,
    AST_NODE_TYPES.SwitchStatement,
    AST_NODE_TYPES.TryStatement
]);

/** Is this `if` the `else` branch of another `if`? Such a link continues a chain; it opens no level. */
const isElseIf = (node: TSESTree.Node): boolean =>
    node.type === AST_NODE_TYPES.IfStatement &&
    node.parent.type === AST_NODE_TYPES.IfStatement &&
    node.parent.alternate === node;

/** Loops: only their `body` is one level deeper (the header is read on the outer level). */
type Loop =
    | TSESTree.ForStatement
    | TSESTree.ForInStatement
    | TSESTree.ForOfStatement
    | TSESTree.WhileStatement
    | TSESTree.DoWhileStatement;

/** The statement kinds that make a {@link Loop}. */
const LOOPS = new Set<string>([
    AST_NODE_TYPES.ForStatement,
    AST_NODE_TYPES.ForInStatement,
    AST_NODE_TYPES.ForOfStatement,
    AST_NODE_TYPES.WhileStatement,
    AST_NODE_TYPES.DoWhileStatement
]);

/** Is this node one of the five loop statements? */
const isLoop = (node: TSESTree.Node): node is Loop => LOOPS.has(node.type);

/**
 * Does `parent` open a level for the part of it that `child` is?
 *
 * The part matters: a loop's `for (…; test; …)` header, an `if (test)` condition (an `else if`'s
 * included) and a `switch (discriminant)` are read at the OUTER level, so only bodies and
 * branches count. An `else if` itself is a branch of the head `if` but adds no level of its own.
 */
const opensLevelFor = (parent: TSESTree.Node, child: TSESTree.Node): boolean => {
    if (parent.type === AST_NODE_TYPES.IfStatement)
        return child !== parent.test && !isElseIf(child);
    if (isLoop(parent)) return child === parent.body;
    if (parent.type === AST_NODE_TYPES.SwitchStatement) return child !== parent.discriminant;
    return parent.type === AST_NODE_TYPES.TryStatement;
};

/** Members a reader enters fresh: the count starts over inside them. */
const MEMBERS = new Set<string>([
    AST_NODE_TYPES.FunctionDeclaration,
    AST_NODE_TYPES.MethodDefinition,
    AST_NODE_TYPES.PropertyDefinition,
    AST_NODE_TYPES.StaticBlock,
    AST_NODE_TYPES.TSAbstractMethodDefinition,
    AST_NODE_TYPES.TSAbstractPropertyDefinition
]);

/**
 * Is this node a function a reader enters fresh — so the count starts over inside it?
 *
 * An object-literal method (`{ m() {} }`, a getter) is one too; every other function
 * expression, and every arrow, carries the depth.
 */
const restartsDepth = (node: TSESTree.Node): boolean =>
    MEMBERS.has(node.type) ||
    (node.type === AST_NODE_TYPES.Property && (node.method || node.kind !== 'init'));

/**
 * The level a block-opening statement sits at, or `undefined` when something above it in the
 * same unit is already reported.
 */
const levelOf = (node: TSESTree.Node, reported: ReadonlySet<TSESTree.Node>): number | undefined => {
    let level = 1;
    let child = node;
    let parent: TSESTree.Node | undefined = node.parent;
    while (parent) {
        if (restartsDepth(parent)) return level;
        // Whole subtree under a reported block is not walked further.
        if (reported.has(parent)) return undefined;
        if (opensLevelFor(parent, child)) level += 1;
        child = parent;
        ({ parent } = parent);
    }
    return level;
};

/** Flags the first block nested deeper than `max` levels, counting through callbacks. */
export const maxDepthThroughClosures = ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
    meta: {
        type: 'suggestion',
        docs: { description: 'Block nesting limit that keeps counting inside callbacks' },
        schema: [
            {
                type: 'object',
                properties: { max: { type: 'integer', minimum: 0 } },
                additionalProperties: false
            }
        ],
        messages: {
            tooDeep:
                'This block is nested {{level}} levels deep, through callbacks too; the limit ' +
                'is {{max}}. Name the inner step instead.'
        },
        defaultOptions: [{ max: DEFAULT_MAX }]
    },
    create(context, [{ max = DEFAULT_MAX } = {}]) {
        /** Blocks already reported; everything inside one is left alone. */
        const reported = new Set<TSESTree.Node>();

        /** Reports `node` when it opens a level past the limit. */
        const check = (node: TSESTree.Node): void => {
            if (isElseIf(node)) return;
            const level = levelOf(node, reported);
            if (level === undefined || level <= max) return;
            reported.add(node);
            context.report({ node, messageId: 'tooDeep', data: { level, max } });
        };

        return Object.fromEntries([...LEVEL_OPENERS].map((type) => [type, check]));
    }
});
