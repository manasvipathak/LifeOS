# LifeOS Development Guide

## 1. Prerequisites

Before starting implementation, make sure the following are installed on the development machine:

- Node.js 20 LTS or newer
- npm 10+
- Git
- MongoDB local server or MongoDB Atlas access
- A code editor such as VS Code
- Optional: an AI provider key for OpenAI or another supported provider

## 2. Recommended project bootstrap for an empty workspace

Because the workspace is currently empty, the minimal initialization command is:

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --use-npm --yes
```

If the user wants to avoid the default src directory, this is the simplest clean option. If the project should use a custom `src` directory, add `--src-dir` to the command.

After the app is created, install the product dependencies specific to the planned architecture, including:

```bash
npm install mongoose zod bcryptjs next-auth react-hook-form @hookform/resolvers date-fns recharts lucide-react
npm install -D vitest @vitest/coverage-v8 playwright eslint @types/node @types/react @types/react-dom
```

The exact package selection can be refined after the project is initialized based on the generated Next.js version and official compatibility checks.

## 3. Environment variables

Create `.env.local` from the example. In PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Generate a local Auth.js secret, then put that value in both `AUTH_SECRET` and `NEXTAUTH_SECRET` in `.env.local`:

```powershell
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

Keep the generated value and MongoDB credentials in `.env.local` only. `.gitignore` excludes it; never commit it or send it in chat.

Example required values:

```env
AUTH_SECRET=use-the-generated-local-secret
NEXTAUTH_SECRET=use-the-same-generated-local-secret
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017/lifeos
MONGODB_DB_NAME=lifeos
NEXT_PUBLIC_APP_URL=http://localhost:3000
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=replace-with-your-openai-key
```

OpenAI remains the default provider. Its server-side key is `OPENAI_API_KEY`; `AI_MODEL` defaults to `gpt-4o-mini`. Never use a `NEXT_PUBLIC_` name for provider keys. Restart the development server after changing provider settings. If the selected provider's key is absent, extraction returns a setup message instead of fabricated results.

### Google Gemini free-tier alternative

Google currently lists Gemini 2.5 Flash Lite text input and output as free of charge on the Gemini Developer API Free tier. The free tier has limited, changeable request quotas and Google's terms say free-tier content may be used to improve its products. Do not submit sensitive task descriptions through this provider. Check Google's [current pricing and limits](https://ai.google.dev/gemini-api/docs/pricing) before use.

1. Sign in to [Google AI Studio](https://aistudio.google.com/), open [API Keys](https://aistudio.google.com/apikey), and create a key for a project with Gemini API access. New keys may be authorization keys; use the key AI Studio creates, and keep it private.
2. Add these settings to the repository-root `.env.local`, replacing the key placeholder with your Google AI Studio key:

```env
AI_PROVIDER=google
GOOGLE_API_KEY=replace-with-your-google-ai-studio-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

3. Restart `npm run dev`. To switch back to OpenAI, set `AI_PROVIDER=openai`; `OPENAI_API_KEY` and `AI_MODEL` remain the OpenAI configuration.

Gemini uses the server-side `x-goog-api-key` header and the `generateContent` structured JSON response format. The key is never sent to the browser. Responses are validated with the same Zod schema before proposals are shown.

## 4. Database setup

### Local MongoDB

- Install MongoDB Community Edition or run a local MongoDB container, and start the MongoDB service on `127.0.0.1:27017`.
- Use `MONGODB_URI=mongodb://127.0.0.1:27017/lifeos` and `MONGODB_DB_NAME=lifeos` in `.env.local`. The connection utility explicitly selects `MONGODB_DB_NAME`, so keep the URI database path and setting consistent.
- Restart `npm run dev` after changing environment values.

### MongoDB Atlas

1. Sign in to MongoDB Atlas and create a project and a free cluster.
2. Under **Database Access**, create a database user and grant it read/write access to the `lifeos` database. This database user's password is separate from your Atlas website password.
3. Under **Network Access**, add your current development IP address.
4. Open the cluster's **Connect** flow, choose **Drivers** and **Node.js**, then copy the connection string.
5. In your local `.env.local`, replace the URI placeholders with the database username, URL-encoded database password, and cluster host. Keep `/lifeos` as the database path and set `MONGODB_DB_NAME=lifeos`:

```env
MONGODB_URI=mongodb+srv://<database-user>:<url-encoded-password>@<cluster-host>/lifeos?retryWrites=true&w=majority
MONGODB_DB_NAME=lifeos
```

6. Save `.env.local`, restart `npm run dev`, then try registration in the app. Never put the real Atlas URI in `.env.example`, source code, or chat. If the database password contains symbols, URL-encode them before placing it in the URI.

## 5. Startup commands

Once the project is initialized and dependencies are installed, the expected scripts are:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run type-check
npm run test
```

The project should also include a focused Playwright smoke flow for the critical registration, login, and protected dashboard route.

## 6. Quality gates

Before moving to Phase 1, the project should satisfy these conditions:

- TypeScript strict mode is enabled.
- Route handlers validate input and authenticate sessions.
- Task ownership checks exist in all sensitive operations.
- Passwords are hashed and never stored in plaintext.
- AI endpoints fail gracefully when the provider is not configured.
- `.gitignore` excludes `.env*` files, including `.env.local`.
- Tests cover critical validation and authorization behavior.

## 7. Testing strategy

### Unit tests

Focus on:

- Zod validation schema behavior
- password hashing and matching
- task ownership logic
- date parsing and timezone interpretation
- AI output parsing and validation

### Integration tests

Focus on:

- registration flow
- login/logout flow
- task CRUD access with valid and invalid ownership
- journal entry creation and retrieval

The current automated suite contains database-independent auth validation/password-hash tests and mocked task-route tests for authentication and owner-scoped CRUD queries. Those mocked tests do not connect to MongoDB. Real database integration tests are still needed to verify task persistence and cross-user denial against MongoDB, along with registration persisting a bcrypt hash (not the submitted password), duplicate registration returning `409` including the unique-index race, valid/invalid credential login, logout clearing the Auth.js session, and persisted-user lookup. Do not treat the unit suite as proof of these database-backed flows.

AI extraction tests validate structured proposal parsing, invalid provider output, missing-key handling, authentication, provider selection, structured request construction, and error mapping without calling OpenAI or Gemini. To manually verify live extraction, configure the selected provider's key locally, sign in, open **Tasks**, extract proposals, review/edit/select them, then confirm saving. The tests do not prove that a live provider key, account, model, free-tier quota, or network request works.

### Browser smoke tests

Cover:

- login page rendering
- registration success path
- protected dashboard route redirect behavior
- task form flow

## 8. Troubleshooting

### MongoDB connection fails

- verify the connection string
- confirm the database service is running
- verify the Atlas network access settings if using Atlas

### Authentication fails

- ensure `AUTH_SECRET` is set and long enough
- verify the credentials provider is configured correctly
- inspect cookies and session routing in the App Router

### AI endpoints fail

- confirm the provider key is present in `.env.local`
- check the selected provider is supported by the official SDK
- verify the request contract and provider authentication

### Type errors appear

- confirm TypeScript strict mode is enabled
- avoid blanket `any` usage in new code
- fix validation and service-layer mismatches before moving on

## 9. Documentation and implementation order

The repository should proceed in the requested order:

1. Phase 0: architecture and documentation foundation
2. Phase 1: application core and protected task workflow
3. Phase 2: AI features and confirmation flows
4. Phase 3: analytics, polish, and final verification

This order keeps the app coherent and ensures every feature is built on a verified foundation rather than a brittle prototype.

## 10. Phase checklist with acceptance criteria

### Phase 1 — Working core

Checklist:

- initialize the Next.js project and install the required dependencies
- configure TypeScript, Tailwind, environment validation, and MongoDB connectivity
- set up Auth.js with a credentials provider and secure session behavior
- build protected layouts and dashboard shell
- implement task CRUD with user-scoped ownership checks
- provide task calendar and list views tied to real data

Acceptance criteria:

- users can register, log in, and access protected pages only when authenticated
- task CRUD works for a single authenticated user and denies cross-user access
- the app runs locally without AI configuration and still serves core features

### Phase 2 — AI features

Checklist:

- add provider abstraction and environment-based configuration
- implement AI task extraction with review and confirmation flow
- implement journal entry creation and mood analysis
- add task breakdown and daily planning suggestions
- validate provider output with Zod before save or display

Acceptance criteria:

- AI endpoints return actionable configuration errors when no API key exists
- proposed tasks are reviewable and editable before creation
- journal analysis is clearly marked as approximate and not medical advice

### Phase 3 — Analytics and quality

Checklist:

- implement authenticated analytics queries
- display tasks over time, completion rate, category and priority distributions, and mood history
- add responsive polish, error states, and empty states
- run unit, integration, and browser-level tests
- complete production build validation and final documentation

Acceptance criteria:

- analytics are scoped to the current user only
- the app builds cleanly and tests pass without runtime-critical failures
- the application is ready for local demonstration and portfolio presentation
