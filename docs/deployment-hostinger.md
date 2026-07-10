# Deploy on Hostinger

> **Deprecated for this project.** Deployment is now done via Vercel (free Hobby tier).
> See [deployment-vercel.md](./deployment-vercel.md) for the current guide.

Hostinger Managed Node.js is still a valid hosting option if you prefer it.
The general steps are: buy a Node.js plan, connect your GitHub fork via hPanel Git,
set the same environment variables from [environment-variables.md](./environment-variables.md),
run `npm ci && npm run build`, and configure the Meta webhook to your Hostinger domain.

For a step-by-step Hostinger walkthrough, refer to the upstream template docs at
<https://github.com/ArnasDon/wacrm/blob/main/docs/deployment-hostinger.md>.
