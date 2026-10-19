/**
 * A service member that one named module must call, and every other module must leave alone.
 *
 * Some writes have exactly one legitimate caller outside their own module: `account` writes
 * `users`' credentials, `payments` moves an order to paid. They must be published (the caller sits
 * in another module), so the barrel cannot hide them; and they carry no check of their own,
 * because the caller already made it. This rule is the missing door: it lets the named module
 * reach the member and refuses every other module, the way a friend declaration does in C++.
 *
 * Checks:   a property access on the service handle (`userService.setPassword`), and the same
 *           name pulled out by destructuring (`const { setPassword } = userService`).
 * Skips:    the owning module, and anything the config block does not apply to: tests and
 *           factories are excluded in `eslint.config.ts`, where the rule is turned on.
 * Options:  one entry per handle. The owner is a module name; `friends` the other modules allowed.
 *
 * Why a rule and not a barrel: docs/theory/strategic-ddd.md#friend-members
 */

import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

/** One guarded service handle: who owns it, which members are friends-only, and who the friends are. */
export interface FriendEntry {
    /** The service object's local name, as modules import it: `userService`. */
    handle: string;
    /** The module that owns the service. It may always call its own members. */
    owner: string;
    /** The members that only {@link friends} may call. */
    members: string[];
    /** The modules, other than the owner, allowed to call {@link members}. */
    friends: string[];
}

/** `RuleCreator`'s option tuple: the list of guarded handles. */
type Options = [{ entries: FriendEntry[] }];

/** The one message this rule reports. */
type MessageIds = 'notAFriend';

/** The module a file belongs to, read off `src/modules/<name>/…`, or `undefined` outside the modules. */
const moduleOf = (filename: string): string | undefined =>
    /(?:^|[/\\])src[/\\]modules[/\\]([^/\\]+)[/\\]/.exec(filename)?.[1];

/**
 * The member name a property key spells, when it is a plain name or a string.
 * @param key - the property of a member access, or the key of a destructured property
 * @param computed - whether the key is `[expression]`, which this rule cannot read
 */
const nameOf = (key: TSESTree.Node, computed: boolean): string | undefined => {
    if (!computed && key.type === AST_NODE_TYPES.Identifier) return key.name;
    if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') return key.value;
    return undefined;
};

/** Flags a friends-only service member reached from a module that is neither its owner nor a friend. */
export const friendMembers = ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
    meta: {
        type: 'problem',
        docs: { description: 'A friends-only service member is called only by its named modules' },
        schema: [
            {
                type: 'object',
                properties: {
                    entries: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                handle: { type: 'string' },
                                owner: { type: 'string' },
                                members: { type: 'array', items: { type: 'string' } },
                                friends: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['handle', 'owner', 'members', 'friends'],
                            additionalProperties: false
                        }
                    }
                },
                required: ['entries'],
                additionalProperties: false
            }
        ],
        messages: {
            notAFriend:
                '`{{handle}}.{{member}}` is written for `{{friends}}` alone: it carries no check of ' +
                'its own, because that caller already made one. Another module reaching it skips ' +
                'the check. Use the public door of `{{owner}}` that does the same job, or, if this ' +
                'module really is a second caller, add it to the rule’s `friends` on purpose.'
        }
    },
    defaultOptions: [{ entries: [] }],
    create(context) {
        const caller = moduleOf(context.filename);
        if (caller === undefined) return {};

        /**
         * Report `member` when `handle` guards it and this file's module may not call it.
         * @param node - where to report
         * @param handle - the identifier the member was read from
         * @param member - the member name
         */
        const check = (node: TSESTree.Node, handle: string, member: string | undefined): void => {
            const entry = context.options[0].entries.find(
                (candidate) =>
                    candidate.handle === handle &&
                    member !== undefined &&
                    candidate.members.includes(member)
            );
            if (!entry || caller === entry.owner || entry.friends.includes(caller)) return;

            context.report({
                node,
                messageId: 'notAFriend',
                data: {
                    handle,
                    member,
                    owner: entry.owner,
                    friends: entry.friends.join('`, `')
                }
            });
        };

        return {
            MemberExpression(node) {
                if (node.object.type !== AST_NODE_TYPES.Identifier) return;
                check(node.property, node.object.name, nameOf(node.property, node.computed));
            },
            VariableDeclarator(node) {
                if (node.init?.type !== AST_NODE_TYPES.Identifier) return;
                if (node.id.type !== AST_NODE_TYPES.ObjectPattern) return;
                const handle = node.init.name;
                for (const property of node.id.properties) {
                    if (property.type === AST_NODE_TYPES.Property)
                        check(property.key, handle, nameOf(property.key, property.computed));
                }
            }
        };
    }
});
