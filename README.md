# LifeOS

LifeOS is a calm, AI-assisted personal productivity platform built with Next.js, TypeScript, Tailwind CSS, MongoDB, and Mongoose.

## Prerequisites

- Node.js 20 LTS or newer
- npm 10+
- MongoDB local instance or MongoDB Atlas access
- VS Code on Windows

## Installation

```bash
npm install
```

## Environment setup

Create a `.env.local` file based on `.env.example` and replace the placeholder values with your actual local configuration.

```bash
copy .env.example .env.local
```

Required variables:

```env
AUTH_SECRET=replace-with-a-random-32-byte-secret
AUTH_URL=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017/lifeos
MONGODB_DB_NAME=lifeos
NEXT_PUBLIC_APP_URL=http://localhost:3000
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=replace-with-your-openai-key
GOOGLE_API_KEY=replace-with-your-google-ai-studio-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

OpenAI remains the default provider. To use the optional Gemini free tier, set `AI_PROVIDER=google` in `.env.local`. Gemini free-tier quotas are limited, and Google may use free-tier content to improve its products; avoid submitting sensitive task descriptions.

## MongoDB setup

### Local MongoDB

- Install MongoDB Community Edition or run a local MongoDB container.
- Start the database service.
- Ensure the connection string points to your local MongoDB instance.

### MongoDB Atlas

- Create a cluster and database user.
- Copy the connection string into `MONGODB_URI`.
- Allow your local IP address in Atlas network access.

## Development

```bash
npm run dev
```

Open http://localhost:3000 to view the app.

## Production build

```bash
npm run build
npm run start
```

## Checks

```bash
npm run type-check
npm run lint
npm run build
```

## Notes

- `.env.local` and any real secrets are ignored by Git.
- AI features are optional. If no provider key is configured, the app stays running but AI functionality returns a clear configuration error.
- The app includes authenticated task CRUD and optional AI-powered task extraction. AI extraction requires a server-side `OPENAI_API_KEY`; proposals are reviewed and explicitly saved by the user. The key is never sent to the browser.
