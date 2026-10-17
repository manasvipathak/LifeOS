# LifeOS

LifeOS is an AI-assisted productivity app built with Next.js App Router, TypeScript, MongoDB/Mongoose, Auth.js credentials authentication, and optional OpenAI or Google Gemini APIs.

## Local development

Prerequisites: Node.js 20+, npm 10+, and a local MongoDB instance or Atlas cluster.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set the local Auth.js secrets, app URLs, `MONGODB_URI`, and `MONGODB_DB_NAME` in `.env.local`. Generate a strong Auth.js secret locally; keep it stable for the environment. AI provider configuration is optional:

- OpenAI (default): `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optional `AI_MODEL` (defaults to `gpt-4o-mini`).
- Google Gemini: `AI_PROVIDER=google`, `GOOGLE_API_KEY`, and optional `GEMINI_MODEL`.

Provider keys must stay server-side and must not use a `NEXT_PUBLIC_` prefix. Without the selected AI key, the app's regular task/journal features and rules-based priority suggestions remain usable; AI requests report a configuration error. Avoid sending confidential personal, health, financial, or journal data to an AI provider.

On the affected Windows development environment, `npm run dev` loads `dns-preload.cjs` to use `8.8.8.8` for Node DNS lookups. The preload is scoped to development; production `build`/`start` do not use it.

## Features and data flow

- Authenticated dashboard, task CRUD, calendar, journal, and analytics.
- Settings include editable name/timezone, a browser-persisted dashboard theme, and Auth.js sign-out. Email changes, password resets, and notification preferences are not supported.
- Natural-language task extraction returns schema-validated proposals for review; tasks are saved only after explicit user confirmation.
- Task-priority recommendations include a deterministic rules baseline and an optional LLM comparison. Neither recommendation changes saved priorities automatically.
- Task and journal reads/writes are scoped to the authenticated user's ID.

See [the development guide](./docs/DEVELOPMENT.md) for architecture, environment setup, Atlas networking, test/evaluation instructions, privacy considerations, and deployment checks. See [API contracts](./docs/API_CONTRACTS.md) for the HTTP request/response shapes.

## Checks

```powershell
npm test
npm run type-check
npm run lint
npm run build
```

## Offline AI evaluation

The version-controlled `data/evaluation/` files contain 50 synthetic examples for extraction and 50 synthetic examples for prioritization. To evaluate supplied model outputs:

```powershell
npm run evaluate:ai -- --template data/evaluation/my-predictions.json
# Fill the template with actual outputs; then:
npm run evaluate:ai -- --predictions data/evaluation/my-predictions.json
```

Run the rules-only prioritization baseline without an API key:

```powershell
npm run evaluate:priority
```

Tests mock AI providers and do not make paid or live provider requests. Evaluation scores are calculated only from the prediction file supplied; a score from expected labels is not evidence of model performance.

## Production notes

Configure server-side secrets in the deployment platform, use HTTPS, least-privilege MongoDB credentials, and restrict Atlas network access to the deployment's outbound IP range/private network. The current Atlas project has a broad network-access rule that should be restricted before production use. Production DNS/network configuration must not depend on the local development preload.
