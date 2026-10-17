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

## 4. Profile settings

### Read current profile

- Method: `GET`
- Route: `/api/settings/profile`
- Authentication: required
- Response: `{ profile: { name, email, timezone } }`
- Only fields safe to show in Settings are returned; credentials and password hashes are never included.

### Update current profile

- Method: `PATCH`
- Route: `/api/settings/profile`
- Authentication: required
- Request body: `{ name: string; timezone: string }`
- Editable fields are limited to the existing User schema's `name` and `timezone`. Name and IANA timezone are validated on the server. The email is read-only, and unknown fields are rejected.
- The update query matches the authenticated user's database ID; settings cannot be read or changed for another user.
- Theme preference is stored in the current browser's local storage and is not sent to the server.

## 5. Mood tracking

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

## 6. AI task extraction

### Extract tasks from text

- Method: `POST`
- Route: `/api/ai/extract-tasks`
- Authentication: required
- Request body:

```ts
{
  text: string; // trimmed, 1–6,000 characters; no additional properties
}
```

- Response:

```ts
{
  proposals: Array<{
    title: string;
    priority: 'low' | 'medium' | 'high';
    dueDate: string | null; // YYYY-MM-DD when supported; otherwise null
  }>;
}
```

- Validation:
  - request JSON is limited to 32 KiB
  - at most 20 strict task proposals are returned
  - ambiguous or unsupported dates are withheld as `null`
  - provider output must conform to the Zod schema before the UI displays it
  - extraction does not persist tasks; the user reviews and explicitly saves proposals

- Error statuses:
  - 400: malformed JSON or invalid input
  - 401: no authenticated session
  - 413: request body exceeds 32 KiB
  - 429: provider quota or rate limit, where mapped
  - 502: malformed provider output or provider request failure
  - 503: missing AI configuration or provider temporarily unavailable
  - 504: provider timeout

### Task-priority recommendations

- Method: `POST`
- Route: `/api/ai/prioritize-tasks`
- Authentication: required
- Request body:

```ts
{
  taskIds: string[]; // 1–50 unique MongoDB ObjectId strings for tasks owned by the user
  includeLLM?: boolean; // defaults to false; true requests an additional provider suggestion
}
```

- Response:

```ts
{
  baseline: Array<{
    taskId: string;
    priority: 'low' | 'medium' | 'high';
    explanation: string;
    score: number;
  }>;
  recommendations: Array<{
    taskId: string;
    priority: 'low' | 'medium' | 'high';
    explanation: string;
  }>; // empty unless includeLLM is true
}
```

- Only owner-scoped task fields (selected priority, deadline, and status) are used; titles and descriptions are not sent to the provider.
- Recommendations are advisory and are never saved automatically.

## 7. AI task breakdown

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

## 8. AI daily planning

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

## 9. Journal endpoints

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

## 10. Analytics endpoints

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

## 11. Error conventions

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
