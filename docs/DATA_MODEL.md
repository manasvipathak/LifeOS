# LifeOS Data Model

## 1. Overview

LifeOS stores its data in MongoDB collections using Mongoose. The model is intentionally simple: user, task, journal, and manually logged mood-entry collections. Ownership is enforced at query time and in service-layer authorization checks.

## 2. User collection

### Schema

```ts
interface User {
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  timezone: string; // default: 'UTC'
  createdAt: Date;
  updatedAt: Date;
}
```

### Field rules

- `name`: human-readable name; required.
- `email`: normalized lowercase email address; required.
- `passwordHash`: bcrypt hash only; never exposed in ordinary queries or API responses.
- `timezone`: IANA timezone string or a safe default like `UTC`.
- `createdAt` / `updatedAt`: timestamps managed by Mongoose.

### Indexes

- unique index on normalized email
- optional index on `createdAt` for analytics and user-specific history queries

### Security and validation

- store only hashed passwords
- normalize email before create/update
- reject duplicate registrations with a safe `409` conflict response
- do not expose `passwordHash` in normal serialized output

## 3. Task collection

### Schema

```ts
interface Task {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  category: 'study' | 'work' | 'personal' | 'health' | 'other' | string;
  dueDate?: Date;
  source: 'manual' | 'ai';
  subtasks?: Array<{
    title: string;
    done: boolean;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
```

### Field rules

- `userId`: required reference to the owning user.
- `title`: required; length limited to a reasonable value such as 1-200 characters.
- `description`: optional and trimmed.
- `status`: one of `todo`, `in_progress`, `completed`.
- `priority`: one of `low`, `medium`, `high`.
- `category`: controlled default categories plus extensible validation for custom categories when needed.
- `dueDate`: optional, but if present it must be a valid date.
- `source`: `manual` or `ai`.
- `subtasks`: optional list of user-accepted sub-tasks for breakdown flows.

### Indexes

- index on `userId`
- compound index on `userId + status`
- compound index on `userId + dueDate`
- compound index on `userId + category`
- index on `completedAt` for analytics and completion history

### Ownership rules

- all task reads, updates, and deletes must be scoped to the authenticated owner
- no cross-user task queries are allowed
- all task service methods should receive the session user ID as the owner discriminator

## 4. JournalEntry collection

### Schema

```ts
interface JournalEntry {
  _id: ObjectId;
  userId: ObjectId;
  text: string;
  moodLabel?: 'happy' | 'calm' | 'tired' | 'stressed' | 'sad' | 'motivated' | 'neutral' | 'other';
  moodIntensity?: number; // optional if user provides or system supports it explicitly
  aiSummary?: string;
  stressIndicator?: {
    value?: 'low' | 'moderate' | 'high';
    confidence?: 'low' | 'medium' | 'high';
    note?: string;
  };
  entryDate: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Field rules

- `text`: required, user-authored journal text.
- `moodLabel`: a controlled label set.
- `moodIntensity`: optional and only accepted if clearly supported by the product decision.
- `aiSummary`: optional explanation generated from the submitted text only.
- `stressIndicator`: optional, clearly identified as AI-estimated and uncertain.
- `entryDate`: date of the journal entry, not necessarily the creation timestamp.

### Indexes

- index on `userId`
- compound index on `userId + entryDate`
- optional index on `createdAt` for recent entries and history screens

### Privacy and AI labeling

- Journal data stays private to its owner.
- The interface must say clearly that mood analysis is approximate and not a medical or psychological diagnosis.
- The application should not store sensitive personal attributes beyond what is needed for the mood and productivity features.

## 5. MoodEntry collection

### Schema

```ts
interface MoodEntry {
  _id: ObjectId;
  userId: ObjectId;
  mood: 'very_happy' | 'happy' | 'neutral' | 'sad' | 'stressed';
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Field and ownership rules

- `userId`: required reference to the authenticated owner; never accepted from the client.
- `mood`: one of the five supported self-reported moods.
- `note`: optional, trimmed, and limited to 280 characters.
- History reads are scoped to the current user's `userId` and sorted newest first.
- Mood entries are user self-reports; this collection does not perform or imply AI or clinical analysis.

### Indexes

- compound index on `userId + createdAt` for recent owner-scoped history.

## 6. Timezone policy

The app uses a clear timezone policy to avoid silent mistakes:

- user timezone is stored in the profile and defaults to `UTC`
- natural-language task extraction receives the user timezone and current date as context
- relative dates like "tomorrow" or "Friday" are resolved using the user timezone, not server locale
- deadline display is formatted according to the user timezone
- if the input is ambiguous, the AI response must explicitly say so instead of inventing a date or time

## 7. Retention and domain boundaries

- Keep records private to a single user.
- Do not create a complex relational schema for small, user-owned collections.
- Consider future retention settings for journal history and analytics if the product grows, but do not overbuild this in Phase 0.
- Use sensible result limits for analytics and list endpoints to avoid unbounded reads.

## 8. Example ownership rules

Every service call should enforce patterns like this:

```ts
const userId = session.user.id;
const task = await TaskModel.findOne({ _id: taskId, userId }).lean();
if (!task) {
  throw new ForbiddenError('Task not found or not owned by current user');
}
```

This is the fundamental safety check for the product.
