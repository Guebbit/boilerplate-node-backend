/**
 * `scripts/eslint/friend-members` still fires. Like the other rule tests here it carries one known-bad
 * input per CHECK (a member access, a destructuring) and a valid case for each way a file is allowed
 * to reach the member: it is the owner, it is a friend, or the name is not a guarded one.
 */
import { RuleTester } from 'eslint';
import * as parser from '@typescript-eslint/parser';
import { friendMembers } from '../../../../scripts/eslint/friend-members';

const tester = new RuleTester({
    languageOptions: { parser, ecmaVersion: 'latest', sourceType: 'module' }
});

const options = [
    {
        entries: [
            {
                handle: 'userService',
                owner: 'users',
                members: ['setPassword', 'markEmailVerified'],
                friends: ['account']
            },
            {
                handle: 'orderService',
                owner: 'orders',
                members: ['markPaid'],
                friends: ['payments']
            }
        ]
    }
];

tester.run('friend-members', friendMembers as never, {
    valid: [
        {
            // The friend: `account` is the one module that writes credentials.
            code: `userService.setPassword(user, 'x');`,
            filename: 'src/modules/account/services/password.ts',
            options
        },
        {
            // The owner reaches its own members.
            code: `orderService.markPaid(id);`,
            filename: 'src/modules/orders/services/status.ts',
            options
        },
        {
            // A member nobody guarded is anybody's.
            code: `userService.getById(id);`,
            filename: 'src/modules/cart/services/items.ts',
            options
        },
        {
            // The same name on another object is not the guarded handle.
            code: `somethingElse.markPaid(id);`,
            filename: 'src/modules/cart/services/items.ts',
            options
        },
        {
            // A file outside the modules (a script, a scenario) is not this rule's business.
            code: `userService.setPassword(user, 'x');`,
            filename: 'scenarios/accounts.ts',
            options
        }
    ],
    invalid: [
        {
            // Another module reaching the credential write skips the checks `account` already made.
            code: `userService.setPassword(user, 'x');`,
            filename: 'src/modules/cart/services/items.ts',
            options,
            errors: [{ messageId: 'notAFriend' }]
        },
        {
            // A chained call is still a property access on the handle.
            code: `userService\n    .markEmailVerified(user)\n    .then(() => undefined);`,
            filename: 'src/modules/orders/services/status.ts',
            options,
            errors: [{ messageId: 'notAFriend' }]
        },
        {
            // Pulling the member out by destructuring is the same reach.
            code: `const { markPaid } = orderService;`,
            filename: 'src/modules/invoicing/services/issue-invoice.ts',
            options,
            errors: [{ messageId: 'notAFriend' }]
        },
        {
            // A string key is read too.
            code: `orderService['markPaid'](id);`,
            filename: 'src/modules/cart/services/items.ts',
            options,
            errors: [{ messageId: 'notAFriend' }]
        }
    ]
});
