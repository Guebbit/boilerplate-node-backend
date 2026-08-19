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
                { text: 'Tools', link: '/tools/' },
                { text: 'API', link: '/api/' }
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
                            { text: 'Request Flow', link: '/theory/request-flow' },
                            { text: 'Request Input', link: '/theory/request-input' },
                            { text: 'Clustering & Shutdown', link: '/theory/clustering' }
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
                            { text: 'Security', link: '/tools/security' }
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
                            { text: 'Load Testing', link: '/tools/load-testing' }
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
