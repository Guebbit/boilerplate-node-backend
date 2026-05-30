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
                            { text: 'Architecture', link: '/theory/architecture' },
                            { text: 'Layers', link: '/theory/layers' },
                            { text: 'Request Flow', link: '/theory/request-flow' },
                            { text: 'Clustering & Shutdown', link: '/theory/clustering' }
                        ]
                    }
                ],
                '/tools/': [
                    {
                        text: 'Overview',
                        items: [{ text: 'Overview', link: '/tools/' }]
                    },
                    {
                        text: 'Setup',
                        collapsed: false,
                        items: [
                            { text: 'Package Dependencies', link: '/tools/package-dependencies' },
                            { text: 'Package Scripts', link: '/tools/package-scripts' },
                            { text: 'Docker & Podman', link: '/tools/docker-and-podman' },
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
                            { text: 'Email & PDF Rendering', link: '/tools/email-and-rendering' },
                            { text: 'WebSockets', link: '/tools/websockets' }
                        ]
                    },
                    {
                        text: 'Observability',
                        collapsed: false,
                        items: [
                            { text: 'Winston & Audit Logs', link: '/tools/winston' },
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
                        text: 'Analytics & QA',
                        collapsed: false,
                        items: [
                            { text: 'PostHog', link: '/tools/posthog' },
                            { text: 'Testing & Docs', link: '/tools/testing-and-docs' }
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
