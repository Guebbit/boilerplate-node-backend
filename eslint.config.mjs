import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import html from 'eslint-plugin-html'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'

export default tseslint.config(
    /**
     *
     */
    eslint.configs.recommended,

    /**
     *
     */
    tseslint.configs.recommendedTypeChecked,

    /**
     *
     */
    tseslint.configs.strictTypeChecked,

    /**
     *
     */
    tseslint.configs.stylisticTypeChecked,

    /**
     *
     */
    eslintPluginUnicorn.configs['flat/recommended'],

    /**
     *
     */
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        }
    },

    /**
     *
     */
    {
        ignores: [
            'dist/**/*',
            'node_modules/**/*',
            'eslint.config.mjs'
        ],

        plugins: {
            html
            // unicorn: eslintPluginUnicorn
        },

        languageOptions: {
            globals: {
                ...globals.browser
            },
            ecmaVersion: 'latest',
            sourceType: 'module'
        },

        rules: {
            'no-console': 'warn',
            'no-debugger': 'warn',
            'no-nested-ternary': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',

            '@typescript-eslint/restrict-template-expressions': [
                'error',
                {
                    allowNumber: true,
                },
            ],

            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'default',
                    format: ['camelCase', 'PascalCase'],
                    leadingUnderscore: 'allow',
                    trailingUnderscore: 'allow'
                },
                {
                    selector: 'variable',
                    format: ['camelCase', 'UPPER_CASE'],
                    leadingUnderscore: 'allow',
                    trailingUnderscore: 'allow'
                },
                {
                    selector: ['class', 'typeLike', 'typeParameter', 'enum'],
                    format: ['PascalCase']
                },
                {
                    selector: ['function'],
                    format: ['camelCase'],
                    leadingUnderscore: 'allow'
                },
                {
                    selector: 'interface',
                    format: ['PascalCase'],

                    custom: {
                        regex: '^I[A-Z]',
                        match: true
                    }
                },
                {
                    selector: 'enum',
                    format: ['PascalCase'],

                    custom: {
                        regex: '^E[A-Z]',
                        match: true
                    }
                },
                {
                    selector: ['memberLike', 'enumMember'],
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'],
                    leadingUnderscore: 'allow',
                    trailingUnderscore: 'allow'
                }
            ],

            'unicorn/prevent-abbreviations': 'off',
            'unicorn/no-anonymous-default-export': 'off',

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/consistent-destructuring.md
            'unicorn/better-regex': 'warn',

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/better-regex.md
            'unicorn/consistent-destructuring': 'warn',

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/filename-case.md
            'unicorn/filename-case': [
                'error',
                {
                    'case': 'kebabCase'
                }
            ],

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/catch-error-name.md
            'unicorn/catch-error-name': [
                'error',
                {
                    'name': 'error'
                }
            ]
        }
    },

    /**
     *
     */
    // WARNING: Slows down a lot
    // {
    //     files: ['**/*.tsx'],
    //
    //     rules: {
    //         'unicorn/filename-case': [
    //             'error',
    //             {
    //                 'case': 'pascalCase'
    //             }
    //         ]
    //     }
    // },

    /**
     *
     */
    {
        files: ['tests/**/*'],

        languageOptions: {
            globals: {
                ...globals.jest
            }
        }
    }
)