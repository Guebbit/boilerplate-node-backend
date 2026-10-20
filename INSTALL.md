# Install checklist

What this backend needs from outside the code before it is yours: an account, a key, a domain, a
legal text, a hands-on check. One line each; the linked page is the real guide. Nothing here lists
settings: `npm run setup` and the boot refusal already do that.

If you pair it with the Vue frontend, that repository has its own `INSTALL.md`.

## Required to boot

- [ ] Secrets: [Secrets](docs/getting-started-production.md#secrets), [First run](docs/tools/configuration.md#first-run-npm-run-setup)
- [ ] The shop's legal identity: [Shop identity](docs/modules/orders.md#shop-identity), [Invoicing](docs/modules/invoicing.md#configuration)
- [ ] Session mode: [Choosing the session mode](docs/modules/account-sessions.md#choosing-the-session-mode)
- [ ] A domain and TLS: [Reverse proxy](docs/getting-started-production.md#putting-a-reverse-proxy-in-front)
- [ ] The first admin: [The first admin](docs/getting-started-production.md#the-first-admin)

## Features, each off until you act

- [ ] Mail over SMTP: [SMTP configuration](docs/tools/email-and-rendering.md#smtp-configuration), [hosted provider](docs/tools/email-and-rendering.md#using-a-hosted-provider), [SPF, DKIM, DMARC](docs/tools/deployment-hardening.md#email-authentication-spf-dkim-dmarc)
- [ ] Payments: no real provider ships, write an adapter: [Adding a real adapter](docs/modules/payments-provider-port.md#adding-a-real-adapter-stripe-as-the-example)
- [ ] Social login: register an app per provider, then sign in once with each by hand: [Registering the provider apps](docs/modules/account-oauth.md#registering-the-apps)
- [ ] Human challenge: [Choosing a provider](docs/modules/antibot.md#choosing-a-provider)
- [ ] Breached-password lookups: [Guessing the credential](docs/theory/defences/authentication.md#guessing-the-credential)
- [ ] Analytics: [Configuration](docs/tools/analytics.md#configuration)
- [ ] Alerts that reach a person: [Monitoring and alerts](docs/getting-started-production.md#monitoring-and-alerts)
- [ ] An outside watcher on a second machine: [Gatus](docs/tools/gatus.md#production-the-second-machine)
- [ ] Backups, and a restore drill: [Backups](docs/getting-started-production.md#backups)
- [ ] Uploads on a volume: [Uploaded images](docs/getting-started-production.md#uploaded-images-do-not-outlive-the-container)
- [ ] A disclosure contact: [Publish a disclosure contact](docs/getting-started-production.md#publish-a-disclosure-contact)

## Before the first customer: a staging copy

Production with test data, to check what the test suite cannot: [A staging copy](docs/getting-started-production.md#a-staging-copy)

- [ ] A machine, any small VM that runs Podman, with Docker Compose behind `podman compose`: [Hosting](docs/tools/hosting.md), [compose provider](docs/tools/docker-and-podman.md#the-compose-provider-behind-podman-compose)
- [ ] A name, `staging.<domain>` pointing at it: [Reverse proxy](docs/getting-started-production.md#putting-a-reverse-proxy-in-front)
- [ ] Configuration, a client called `staging` with test payment keys: [First run](docs/getting-started-production.md#first-run), [Secrets](docs/getting-started-production.md#secrets)
- [ ] Boot it: [First run](docs/getting-started-production.md#first-run)
- [ ] Every service healthy, no password in the app's environment: [Check it worked](docs/getting-started-production.md#check-it-worked)
- [ ] Walk the money path by hand, from signup to a paid order (and again after every deploy): [A staging copy](docs/getting-started-production.md#a-staging-copy)
- [ ] Fire one alert on purpose and see it arrive: [Monitoring and alerts](docs/getting-started-production.md#monitoring-and-alerts)
- [ ] Reboot the VM, and every service comes back by itself: [Surviving a reboot](docs/getting-started-production.md#surviving-a-reboot)
- [ ] Scan it from another machine: only 80 and 443 answer, TLS is clean: [A staging copy](docs/getting-started-production.md#a-staging-copy)
- [ ] Now and then, delete it and build it again: [A staging copy](docs/getting-started-production.md#a-staging-copy)

## Once per new project

- [ ] GitHub settings (main branch rule, private vulnerability reporting, secret scanning): [Right after you clone](docs/getting-started-new-project.md#right-after-you-clone-the-github-settings)
- [ ] CI pairing with a frontend, or delete that job: [The paired-frontend job](docs/getting-started-new-project.md#ci-pairing)
- [ ] Remove the demo shop if you do not want it: [Removing it](docs/getting-started-new-project.md#removing-it)
- [ ] The licence holder and the AGPL section 13 source offer: [License](README.md#license)
