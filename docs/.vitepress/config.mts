import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
    defineConfig({
        title: 'Boilerplate Node Backend',
        description: 'ADHD-friendly docs for the Express + MongoDB + Mongoose REST boilerplate',
        themeConfig: {
            search: {
                provider: 'local'
            },
            nav: [
                { text: 'Home', link: '/' },
                { text: 'Start', link: '/getting-started' },
                { text: 'Theory', link: '/theory/' },
                { text: 'Modules', link: '/modules/' },
                { text: 'Tools', link: '/tools/' },
                { text: 'API', link: '/api/' },
                { text: 'Files', link: '/reference/' }
            ],
            sidebar: {
                '/theory/': [
                    {
                        text: 'Theory',
                        items: [
                            { text: 'Overview', link: '/theory/' },
                            { text: 'Reading Path', link: '/theory/reading-path' },
                            { text: 'Architecture', link: '/theory/architecture' },
                            { text: 'Modules', link: '/theory/modules' },
                            {
                                text: 'Adding & Removing a Module',
                                link: '/theory/module-lifecycle'
                            },
                            { text: 'Layers', link: '/theory/layers' },
                            { text: 'Domain Layer', link: '/theory/domain-layer' },
                            { text: 'Strategic DDD', link: '/theory/strategic-ddd' },
                            { text: 'Glossary', link: '/theory/glossary' },
                            { text: 'Tactical DDD', link: '/theory/tactical-ddd' },
                            { text: 'Request Flow', link: '/theory/request-flow' },
                            { text: 'Request Input', link: '/theory/request-input' },
                            { text: 'Clustering & Shutdown', link: '/theory/clustering' }
                        ]
                    }
                ],
                '/modules/': [
                    {
                        text: 'Overview',
                        items: [{ text: 'The whole map', link: '/modules/' }]
                    },
                    {
                        text: 'core',
                        collapsed: false,
                        items: [
                            {
                                text: 'cart',
                                link: '/modules/cart',
                                items: [{ text: 'Checkout', link: '/modules/cart-checkout' }]
                            },
                            { text: 'orders', link: '/modules/orders' },
                            { text: 'products', link: '/modules/products' }
                        ]
                    },
                    {
                        text: 'supporting',
                        collapsed: false,
                        items: [
                            { text: 'delivery', link: '/modules/delivery' },
                            {
                                text: 'inventory',
                                link: '/modules/inventory',
                                items: [
                                    {
                                        text: 'Reservations',
                                        link: '/modules/inventory-reservations'
                                    }
                                ]
                            },
                            {
                                text: 'payments',
                                link: '/modules/payments',
                                items: [
                                    {
                                        text: 'The provider port',
                                        link: '/modules/payments-provider-port'
                                    }
                                ]
                            },
                            { text: 'wishlist', link: '/modules/wishlist' }
                        ]
                    },
                    {
                        text: 'generic',
                        collapsed: false,
                        items: [
                            {
                                text: 'account',
                                link: '/modules/account',
                                items: [{ text: 'Sessions', link: '/modules/account-sessions' }]
                            },
                            { text: 'audit-logs', link: '/modules/audit-logs' },
                            { text: 'feedback', link: '/modules/feedback' },
                            { text: 'locales', link: '/modules/locales' },
                            { text: 'observability', link: '/modules/observability' },
                            { text: 'users', link: '/modules/users' }
                        ]
                    }
                ],
                '/tools/': [
                    {
                        text: 'Overview',
                        items: [
                            { text: 'Overview', link: '/tools/' },
                            { text: 'Tools Explained', link: '/tools/tools-explained' }
                        ]
                    },
                    {
                        text: 'Setup',
                        collapsed: false,
                        items: [
                            { text: 'Package Dependencies', link: '/tools/package-dependencies' },
                            { text: 'Testing — Quick Start', link: '/tools/testing-quickstart' },
                            { text: 'Package Scripts', link: '/tools/package-scripts' },
                            { text: 'Docker & Podman', link: '/tools/docker-and-podman' },
                            { text: 'Pairing & Ports', link: '/tools/pairing-and-ports' },
                            { text: 'Runtime', link: '/tools/runtime' },
                            { text: 'Internationalisation', link: '/tools/i18n' },
                            { text: 'Demo profile', link: '/tools/demo-profile' },
                            { text: 'Security', link: '/tools/security' },
                            { text: 'Image Processing', link: '/tools/image-processing' }
                        ]
                    },
                    {
                        text: 'Database',
                        collapsed: false,
                        items: [
                            { text: 'MongoDB & Mongoose', link: '/tools/mongodb-mongoose' },
                            { text: 'Redis Cache', link: '/tools/redis-cache' }
                        ]
                    },
                    {
                        text: 'Messaging',
                        collapsed: false,
                        items: [
                            { text: 'RabbitMQ', link: '/tools/rabbitmq' },
                            { text: 'Email & PDF Rendering', link: '/tools/email-and-rendering' }
                        ]
                    },
                    {
                        text: 'Observability',
                        collapsed: false,
                        items: [
                            { text: 'Events & Logging', link: '/tools/events-and-logging' },
                            { text: 'Winston & Audit Logs', link: '/tools/winston' },
                            { text: 'The Observability Layer', link: '/tools/observability-layer' },
                            {
                                text: 'Observability Reference',
                                link: '/tools/observability-reference'
                            },
                            { text: 'Prometheus', link: '/tools/prometheus' },
                            { text: 'OpenTelemetry', link: '/tools/opentelemetry' },
                            { text: 'Tempo', link: '/tools/tempo' },
                            { text: 'Grafana', link: '/tools/grafana' },
                            { text: 'Loki', link: '/tools/loki' }
                        ]
                    },
                    {
                        text: 'Analytics',
                        collapsed: false,
                        items: [
                            { text: 'Product Analytics', link: '/tools/analytics' },
                            {
                                text: 'Frontend Observability',
                                link: '/tools/frontend-observability'
                            }
                        ]
                    },
                    {
                        text: 'Testing',
                        collapsed: false,
                        items: [
                            { text: 'Testing (overview)', link: '/tools/testing-and-docs' },
                            { text: 'Unit Testing', link: '/tools/unit-testing' },
                            { text: 'Integration Testing', link: '/tools/integration-testing' },
                            {
                                text: 'Contract Testing (Response)',
                                link: '/tools/contract-testing'
                            },
                            {
                                text: 'Contract-Derived Request Data',
                                link: '/tools/contract-request-data'
                            },
                            { text: 'Mutation Testing', link: '/tools/mutation-testing' },
                            {
                                text: 'Coverage & Confidence',
                                link: '/tools/coverage-and-confidence'
                            },
                            { text: 'Load Testing', link: '/tools/load-testing' },
                            { text: 'Dependency Graph', link: '/tools/dependency-graph' },
                            { text: 'Cluster Testing', link: '/tools/cluster-testing' }
                        ]
                    }
                ],
                '/reference/': [
                    {
                        text: 'File Glossary',
                        items: [
                            { text: 'Overview', link: '/reference/' },
                            { text: 'Repository Root', link: '/reference/root' },
                            { text: 'App, Kernel & Types', link: '/reference/src-app' },
                            { text: 'Infrastructure', link: '/reference/src-infrastructure' },
                            { text: 'Modules', link: '/reference/src-modules' },
                            { text: 'Contracts', link: '/reference/contracts' },
                            { text: 'Data', link: '/reference/data' },
                            { text: 'Scripts & Hooks', link: '/reference/scripts' },
                            { text: 'Tests', link: '/reference/tests' },
                            { text: 'Ops & Assets', link: '/reference/ops' }
                        ]
                    }
                ],
                '/api/': [
                    {
                        text: 'API',
                        items: [
                            { text: 'Overview', link: '/api/' },
                            { text: 'Endpoints', link: '/api/endpoints' },
                            { text: 'Observability Endpoints', link: '/api/observability' },
                            { text: 'OpenAPI Workflow', link: '/api/openapi-workflow' },
                            {
                                text: 'Regenerating After a Change',
                                link: '/api/regenerating'
                            },
                            {
                                text: 'Contract Ownership & Fragmentation',
                                link: '/api/contract-fragmentation'
                            },
                            { text: 'AsyncAPI Workflow', link: '/api/asyncapi-workflow' }
                        ]
                    }
                ]
            },
            socialLinks: [
                {
                    icon: 'github',
                    link: 'https://github.com/Guebbit/boilerplate-node-backend'
                }
            ]
        },
        mermaid: {
            theme: 'neutral',
            useMaxWidth: true,
            htmlLabels: true,
            flowchart: {
                nodeSpacing: 45,
                rankSpacing: 70,
                padding: 15
            },
            themeVariables: {
                primaryColor: '#f5f3ff',
                primaryBorderColor: '#7c3aed',
                primaryTextColor: '#111827',
                secondaryColor: '#eff6ff',
                secondaryBorderColor: '#2563eb',
                tertiaryColor: '#ecfeff',
                tertiaryBorderColor: '#0891b2',
                clusterBkg: '#f8fafc',
                clusterBorder: '#cbd5e1',
                lineColor: '#64748b'
            }
        }
    })
);
