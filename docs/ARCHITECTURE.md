# LifeOS Architecture

## 1. Product intent

LifeOS is a personal productivity platform that combines task management, AI-assisted task extraction, mood journaling, and personalized productivity insights. The system supports secure registration and login, task review and confirmation, private journal entries, and analytics scoped to the authenticated user only.

The application is designed for local Windows development in VS Code and must remain easy to reason about, maintain, and extend. The architecture prioritizes safe server-side authorization, centralized services, and explicit AI contracts instead of client-side workarounds.

## 2. Stack and design decisions

- Language: TypeScript with strict mode enabled.
- Frontend: Next.js App Router with React.
- Styling: Tailwind CSS with reusable UI primitives and accessible components.
- Backend: Next.js Route Handlers for API endpoints and server logic.
- Database: MongoDB with Mongoose.
- Authentication: Auth.js with a credentials provider and server-side sessions.
- Validation: Zod.
- Forms: React Hook Form + Zod.
- Date handling: date-fns with a single timezone policy.
- Charts: Recharts.
- Icons: Lucide React.
- Testing: Vitest for unit/integration tests and Playwright for a small set of browser flows where feasible.
- AI integration: a server-side provider abstraction with environment-controlled provider settings.

This stack is intentionally conservative and compatible with a standard Next.js app. It avoids unnecessary services, custom auth flows, or separate API servers.

## 3. Core architectural principles

1. Server-side authority is the source of truth.
   - User identity must come from the verified Auth.js session.
   - Ownership checks are enforced in handlers and services, not only in the UI.
   - Every mutation and read is scoped to the authenticated user.

2. Business logic belongs in services.
   - Route handlers validate requests and call server-side service functions.
   - Database operations stay out of presentation components.
   - AI behavior stays behind a clear provider adapter and structured output validation.

3. External inputs are validated at entry points.
   - Request bodies use Zod schemas.
   - Environment configuration is validated before app startup.
   - AI provider responses are validated before storing or displaying them.

4. AI features fail safely.
   - If AI configuration is missing or the provider is unavailable, the app still runs.
   - Non-AI features work without issue.
   - AI endpoints return actionable configuration or service errors instead of silent fallback behavior.

5. User privacy matters.
   - Password hashes are stored only.
   - Journal data is private to the user and never shared.
   - Analytics are derived from authorized data only.

## 4. Request flow and responsibility boundaries

### Browser UI

The browser renders pages and forms using server components by default. Client components are used only where interactivity is required, such as task forms or dashboard filters.

### Route handlers and server actions

Next.js Route Handlers receive authenticated requests, perform parsing and validation, authorize the session, and call services. Authorization checks are not based on hidden UI state or client input.

### Services

Services isolate business logic such as task CRUD, AI task extraction, journaling, and analytics. Services accept server-side context, perform data access through Mongoose models, and return domain-safe objects.

### Data layer

MongoDB access is centralized through Mongoose models, a DB connection helper, and a development-safe singleton pattern to avoid reconnect storms in hot reload.

## 5. Planned module structure

The application should follow the structure below during actual implementation:

```text
app/
  (auth)/
    login/
    register/
  (dashboard)/
    dashboard/
    tasks/
    calendar/
    journal/
    analytics/
    settings/
  api/
    auth/
    tasks/
    ai/
    journal/
    analytics/
  globals.css
  layout.tsx
  page.tsx

components/
  layout/
  dashboard/
  tasks/
  calendar/
  journal/
  analytics/
  ai/
  ui/

lib/
  auth/
  db/
  validations/
  utils/
  constants/

models/
  User.ts
  Task.ts
  JournalEntry.ts

services/
  tasks/
  ai/
  journal/
  analytics/

types/

docs/
  ARCHITECTURE.md
  DATA_MODEL.md
  API_CONTRACTS.md
  DEVELOPMENT.md

tests/
  unit/
  integration/
  e2e/
```

### Module responsibilities

- app/: route-level pages and API endpoints.
- components/: reusable UI building blocks and feature panels.
- lib/auth/: Auth.js setup, session helpers, role checks, and middleware-safe utilities.
- lib/db/: MongoDB connection handling and shared database helpers.
- lib/validations/: Zod schemas for user input, task objects, journal data, AI responses, and env validation.
- lib/utils/: helper functions for formatting, timezone conversion, date-safe operations, and safe error mapping.
- models/: Mongoose schemas and indexes.
- services/: business logic for task access, task extraction, journaling, and analytics.
- types/: shared domain types and DTO contracts.
- tests/: unit, integration, and browser-level checks.

## 6. Authentication and authorization boundaries

### Authentication

Auth.js credentials authentication is selected for local development and secure server-side session handling. Passwords are hashed with a standard library such as bcryptjs before persistence.

### Required safeguards

- Never trust client-supplied user IDs.
- Always read the current user from the verified session server-side.
- Validate all inputs before processing.
- Use `ObjectId` references and server-side ownership checks for tasks and journal entries.
- Ensure duplicate emails are handled intentionally with controlled error responses.
- Keep secure cookie defaults and CSRF behavior aligned to the chosen Auth.js flow.

## 7. AI flow design

### AI provider abstraction

The AI boundary is intentionally small and isolated:

- request sanitization and validation in the route or service layer
- provider adapter interface to abstract model choice
- schema validation for structured outputs
- explicit user review and confirmation before saving generated tasks

This prevents provider-specific logic from leaking into the rest of the application.

### AI task extraction flow

1. User enters natural-language text in the client.
2. Authenticated API route receives the text and session user.
3. Request schema validates the input and the current timezone.
4. Service calls the AI provider adapter with explicit date and timezone context.
5. Provider response is parsed and validated with Zod.
6. UI receives a reviewable proposal list.
7. User edits or discards tasks before confirming creation.
8. Task creation occurs through the normal task service and persists to MongoDB.

### AI mood analysis flow

- Journal entry text is analyzed by the AI service.
- Output includes mood label, explanation, stress indicator, and supportive suggestion.
- The result is stored as structured metadata on the journal entry record.
- The UI clearly labels AI-generated analysis as approximate and not a medical diagnosis.

### AI breakdown and planning

- Task breakdown takes an existing task and returns suggested subtasks for review.
- Daily planning builds a schedule suggestion from incomplete tasks and deadlines.
- Suggestions are shown as preview output and only persist after user confirmation.

### Failure behavior

- Missing `AI_API_KEY` or provider configuration returns a clean configuration error.
- Provider outage or malformed model output returns a controlled error response.
- No fake or mocked AI data is presented as a real model result.

## 8. Database and ownership model

The application uses a simple MongoDB model with user-scoped collections. No unnecessary relational normalization is introduced. Each collection includes an owner field and authorization checks on all data access.

The intended architecture ensures that:

- every task belongs to one authenticated user
- every journal entry belongs to one authenticated user
- analytics are aggregated only from that user's records
- task deadlines are stored as real dates with timezone-safe interpretation

## 9. Error handling and observability strategy

The application should return consistent error payloads such as:

- 400: invalid schema or bad input
- 401: unauthenticated
- 403: forbidden or ownership violation
- 404: resource not found
- 409: duplicate email or conflict
- 422: AI output validation failure
- 429: rate-limit protection triggered
- 500: unexpected server error

Error handling rules:

- do not return internal stack traces to the browser
- do not expose secrets or environment values in responses
- use safe generic messages for sensitive failures
- log detailed diagnostics server-side only

## 10. Timezone policy

The system will use a single, explicit timezone policy:

- each user has a timezone field, defaulting to UTC if missing
- all relative date expressions are interpreted in the user’s configured timezone
- deadlines are stored as actual dates but interpreted with the user’s timezone context at display and planning time
- date and time strings are never inferred silently when the input is ambiguous

This keeps the logic predictable and prevents deadlines from being invented from vague wording.

## 11. Risk review for the empty workspace

Because the workspace is currently empty, there are no existing dependency or framework incompatibilities to preserve. The main compatibility risks will be introduced later when the project is initialized:

- Node.js version compatibility with the chosen Next.js release
- Auth.js version compatibility with the installed Next.js version
- Mongoose and MongoDB driver compatibility with the selected Node runtime
- AI provider SDK compatibility with the selected provider and environment version

The safest path is to bootstrap with the current LTS Node release, a current stable Next.js version from `create-next-app`, and compatible dependency versions resolved by the package manager.

## 12. Phase 0 deliverables

This phase establishes the foundation and documentation only. It does not implement the task UI or the application logic itself. The generated documents and configuration files form the blueprint for Phase 1.

## 13. Immediate next step after Phase 0

Next, initialize a clean project in the empty workspace using the recommended minimal commands, then proceed to the actual implementation of the working core in Phase 1.
