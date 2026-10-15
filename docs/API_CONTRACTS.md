# LifeOS API Contracts

## 1. Common conventions

- All authenticated endpoints use the Auth.js session cookie.
- All request bodies are validated with Zod.
- Response payloads are JSON with predictable shapes.
- All sensitive errors are sanitized before being sent to the client.
- Server-side ownership checks are mandatory.

## 2. Authentication and session endpoints

### Register user

- Method: `POST`
- Route: `/api/auth/register`
- Authentication: none
- Request body:

```ts
{
  name: string;
  email: string;
  password: string;
  timezone?: string;
}
```

- Response:

```ts
{
  user: {
    id: string;
    name: string;
    email: string;
    timezone: string;
  }
}
```

- Behavior:
  - normalize and validate email
  - hash password with bcrypt
  - reject duplicate emails cleanly
  - create user account only after validation passes

- Error statuses:
  - 400: invalid payload
  - 409: duplicate email
  - 500: unexpected server issue

### Login

- Method: `POST`
- Route: `/api/auth/login` or Auth.js credentials callback route depending the chosen integration
- Authentication: none
- Request body:

```ts
{
  email: string;
  password: string;
}
```

- Behavior:
  - use Auth.js credentials provider
  - verify credentials server-side
  - establish the authenticated session cookie

- Error statuses:
  - 400: invalid payload
  - 401: invalid credentials
  - 429: rate limiting after repeated attempts

### Logout

- Method: `POST`
- Route: `/api/auth/signout` (handled by the Auth.js catch-all route)
- Authentication: Auth.js session cookie; the client `signOut()` helper submits the required CSRF token
- Behavior: Auth.js invalidates the browser session by expiring its session cookie and redirects to the supplied callback URL

### Session retrieval

- Method: `GET`
- Route: `/api/auth/session` (or standard Auth.js session route)
- Authentication: none for the route itself, but the request is used to determine the current authenticated state
- Response:

```ts
{
  user: {
    id: string;
    name: string;
    email: string;
  } | null
}
```

## 3. Task endpoints

### List tasks

- Method: `GET`
- Route: `/api/tasks`
- Authentication: required
- Query parameters:
  - `status?: 'todo' | 'in_progress' | 'completed'`
  - `priority?: 'low' | 'medium' | 'high'`
  - `category?: string`
  - `dueBefore?: ISO date`
  - `dueAfter?: ISO date`
  - `page?: number`
  - `limit?: number`
- Response:

```ts
{
  tasks: Task[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}
```

### Create task

- Method: `POST`
- Route: `/api/tasks`
- Authentication: required
- Request body:

```ts
{
  title: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  category?: string;
  dueDate?: string;
  source?: 'manual' | 'ai';
  subtasks?: Array<{
    title: string;
    done?: boolean;
  }>;
}
```

- Response: created task object
- Validation:
  - title length limits are enforced
  - enum values are validated
  - ownership is checked server-side before save

### Update task

- Method: `PATCH`
- Route: `/api/tasks/[taskId]`
- Authentication: required
- Request body: partial task fields
- Behavior: validate ownership and update only the authenticated user’s document

### Delete task

- Method: `DELETE`
- Route: `/api/tasks/[taskId]`
- Authentication: required
- Behavior: delete only if document belongs to current user

## 4. Mood tracking

### List recent mood entries

- Method: `GET`
- Route: `/api/moods?limit=20`
- Authentication: required
- Query parameter: `limit` is optional and must be between 1 and 50.
- Behavior: return the current user's entries in newest-first order; `userId` is never returned.

### Create mood entry

- Method: `POST`
- Route: `/api/moods`
- Authentication: required
- Request body:

```ts
{
  mood: 'very_happy' | 'happy' | 'neutral' | 'sad' | 'stressed';
  note?: string; // up to 280 characters
}
```

- Behavior: validate the mood and note, derive `userId` from the verified session, and assign timestamps server-side.
- Error statuses: `400` invalid input, `401` unauthenticated, `500` unexpected server issue.

## 5. AI task extraction

### Extract tasks from text

- Method: `POST`
- Route: `/api/ai/extract-tasks`
- Authentication: required
- Request body:

```ts
{
  text: string;
  timezone?: string;
  currentDate?: string;
}
```

- Response:

```ts
{
  tasks: Array<{
    title: string;
    description?: string;
    dueDate?: string;
    dueTime?: string;
    priority?: 'low' | 'medium' | 'high';
    category?: string;
    suggestedSubtasks?: string[];
    ambiguity?: string;
  }>;
}
```

- Validation:
  - ambiguous date/time wording must be surfaced as an explicit ambiguity value
  - no silent invention of dates or times
  - provider output must conform to the Zod schema before the UI displays it

- Error statuses:
  - 400: invalid text or malformed request
  - 401: no authenticated session
  - 422: provider output invalid
  - 500: AI provider unavailable

## 6. AI task breakdown

### Break down an existing task

- Method: `POST`
- Route: `/api/ai/breakdown-task`
- Authentication: required
- Request body:

```ts
{
  taskId: string;
  requestedFocus?: string;
}
```

- Response:

```ts
{
  subtasks: Array<{
    title: string;
    description?: string;
  }>;
}
```

- Behavior:
  - confirm the task belongs to the current user before calling the provider
  - show tasks for review before persisting

## 6. AI daily planning

### Suggest daily plan

- Method: `POST`
- Route: `/api/ai/daily-plan`
- Authentication: required
- Request body:

```ts
{
  date: string;
  timezone?: string;
}
```

- Response:

```ts
{
  plan: Array<{
    taskId?: string;
    title: string;
    reason?: string;
    suggestedOrder: number;
  }>;
}
```

- Behavior:
  - suggestions are generated from the user’s incomplete tasks and deadlines
  - the UI must clearly distinguish a suggestion from a saved schedule change

## 7. Journal endpoints

### Create journal entry

- Method: `POST`
- Route: `/api/journal`
- Authentication: required
- Request body:

```ts
{
  text: string;
  entryDate?: string;
  moodLabel?: string;
  moodIntensity?: number;
}
```

- Response: created journal record

### List journal entries

- Method: `GET`
- Route: `/api/journal`
- Authentication: required
- Query parameters:
  - `from?: ISO date`
  - `to?: ISO date`
  - `page?: number`
  - `limit?: number`

- Response:

```ts
{
  entries: JournalEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}
```

### Mood analysis route

- Method: `POST`
- Route: `/api/journal/analyze`
- Authentication: required
- Request body:

```ts
{
  journalText: string;
  timezone?: string;
}
```

- Response:

```ts
{
  moodLabel: string;
  explanation: string;
  stressIndicator?: {
    value?: 'low' | 'moderate' | 'high';
    note?: string;
    confidence: 'low' | 'medium' | 'high';
  };
  supportiveSuggestion?: string;
  isApproximate: true;
}
```

- Validation:
  - AI output is not a diagnosis
  - uses the submitted text only
  - clear uncertainty messaging is required

## 8. Analytics endpoints

### Productivity analytics

- Method: `GET`
- Route: `/api/analytics`
- Authentication: required
- Query parameters:
  - `from?: ISO date`
  - `to?: ISO date`
  - `groupBy?: 'day' | 'week' | 'month'`
- Response:

```ts
{
  totals: {
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    overdueTasks: number;
    completionRate: number;
  };
  tasksOverTime: Array<{ date: string; completed: number; total: number }>;
  categoryDistribution: Array<{ category: string; count: number }>;
  priorityDistribution: Array<{ priority: string; count: number }>;
  moodHistory: Array<{ date: string; moodLabel: string }>;
  correlationSummary?: {
    observedPattern: string;
    caution: string;
  };
}
```

- Behavior:
  - aggregates only from the current user’s data
  - handles empty collections gracefully
  - avoids causal language in mood-productivity comparisons

## 9. User settings endpoints

### Update user settings

- Method: `PATCH`
- Route: `/api/settings`
- Authentication: required
- Request body:

```ts
{
  timezone?: string;
  name?: string;
}
```

- Response: updated user settings

## 10. Error conventions

Use a common wrapper like this in API responses:

```ts
{
  error: {
    code: 'INVALID_INPUT' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED' | 'AI_CONFIG_ERROR' | 'AI_OUTPUT_INVALID' | 'INTERNAL_ERROR';
    message: string;
  }
}
```

The app should never expose stack traces, environment variables, or provider secrets.
