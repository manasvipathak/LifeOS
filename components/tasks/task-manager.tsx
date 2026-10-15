'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';

type TaskStatus = 'todo' | 'in_progress' | 'completed';
type TaskPriority = 'low' | 'medium' | 'high';

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  dueDate: string | null;
};

type TaskFormValues = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  dueDate: string | null;
};

type TaskProposal = {
  clientId: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  selected: boolean;
};

const pageSize = 20;

async function requestJson(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    if (cause instanceof TypeError) {
      throw new Error('Cannot reach LifeOS. Make sure the development server is running, then reload the page.');
    }
    throw cause;
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error?.message ?? 'The task request could not be completed.');
  }

  return result;
}

function formValues(form: HTMLFormElement): TaskFormValues {
  const values = new FormData(form);

  return {
    title: String(values.get('title') ?? ''),
    description: String(values.get('description') ?? ''),
    status: String(values.get('status') ?? 'todo') as TaskStatus,
    priority: String(values.get('priority') ?? 'medium') as TaskPriority,
    category: String(values.get('category') ?? 'personal'),
    dueDate: String(values.get('dueDate') ?? '') || null,
  };
}

function displayDate(date: string | null) {
  return date ? new Date(date).toLocaleDateString() : 'No due date';
}

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  try {
    return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
  } catch {
    return false;
  }
}

export function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assistantText, setAssistantText] = useState('');
  const [proposals, setProposals] = useState<TaskProposal[]>([]);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSavingProposals, setIsSavingProposals] = useState(false);

  async function loadTasks(targetPage = 1) {
    try {
      const result = await requestJson(`/api/tasks?page=${targetPage}&limit=${pageSize}`);
      setError(null);
      setTasks(result.tasks);
      setPage(result.pagination.page);
      setTotal(result.pagination.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load tasks.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    requestJson(`/api/tasks?page=1&limit=${pageSize}`)
      .then((result) => {
        if (!active) return;
        setTasks(result.tasks);
        setPage(result.pagination.page);
        setTotal(result.pagination.total);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load tasks.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsSaving(true);
    setError(null);

    try {
      await requestJson('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues(form)),
      });
      form.reset();
      setIsLoading(true);
      await loadTasks(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create task.');
    } finally {
      setIsSaving(false);
    }
  }

  async function updateTask(taskId: string, values: TaskFormValues) {
    setIsSaving(true);
    setError(null);

    try {
      await requestJson(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      setEditingTaskId(null);
      setIsLoading(true);
      await loadTasks(page);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update task.');
    } finally {
      setIsSaving(false);
    }
  }

  async function changeStatus(task: Task, status: TaskStatus) {
    await updateTask(task.id, {
      title: task.title,
      description: task.description,
      status,
      priority: task.priority,
      category: task.category,
      dueDate: task.dueDate,
    });
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm('Delete this task?')) return;

    setError(null);
    try {
      await requestJson(`/api/tasks/${taskId}`, { method: 'DELETE' });
      setIsLoading(true);
      if (tasks.length === 1 && page > 1) {
        await loadTasks(page - 1);
      } else {
        await loadTasks(page);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete task.');
    }
  }

  async function extractTasks(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = assistantText.trim();
    setAssistantError(null);
    setAssistantMessage(null);

    if (!text) {
      setAssistantError('Describe at least one task first.');
      return;
    }

    if (text.length > 6000) {
      setAssistantError('Keep the description to 6,000 characters or fewer.');
      return;
    }

    setIsExtracting(true);
    setProposals([]);

    try {
      const result = await requestJson('/api/ai/extract-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!Array.isArray(result?.proposals) || result.proposals.length > 20) {
        throw new Error('The extraction response was malformed. Please try again.');
      }

      const validated: TaskProposal[] = result.proposals.map((proposal: unknown) => {
        if (!proposal || typeof proposal !== 'object') throw new Error('The extraction response was malformed. Please try again.');
        const value = proposal as { title?: unknown; priority?: unknown; dueDate?: unknown };
        if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 200) {
          throw new Error('The extraction response contained an invalid task title.');
        }
        if (!['low', 'medium', 'high'].includes(String(value.priority))) {
          throw new Error('The extraction response contained an invalid priority.');
        }
        if (value.dueDate !== null && !isValidDateOnly(value.dueDate)) {
          throw new Error('The extraction response contained an invalid due date.');
        }

        return {
          clientId: crypto.randomUUID(),
          title: value.title.trim(),
          priority: value.priority as TaskPriority,
          dueDate: value.dueDate as string | null,
          selected: true,
        };
      });

      setProposals(validated);
      if (validated.length === 0) setAssistantMessage('No clear tasks were found. Try adding more detail.');
    } catch (cause) {
      setAssistantError(cause instanceof Error ? cause.message : 'Unable to extract tasks right now.');
    } finally {
      setIsExtracting(false);
    }
  }

  async function saveSelectedProposals() {
    const selected = proposals.filter((proposal) => proposal.selected);
    setAssistantError(null);
    setAssistantMessage(null);

    if (selected.length === 0) {
      setAssistantError('Select at least one proposed task to save.');
      return;
    }

    const invalidProposal = selected.find((proposal) => !proposal.title.trim() || (proposal.dueDate !== null && !isValidDateOnly(proposal.dueDate)));
    if (invalidProposal) {
      setAssistantError('Each selected task needs a title and a valid due date.');
      return;
    }

    setIsSavingProposals(true);
    const savedIds: string[] = [];
    let failureMessage: string | null = null;

    for (const proposal of selected) {
      try {
        await requestJson('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: proposal.title.trim(),
            priority: proposal.priority,
            dueDate: proposal.dueDate,
            source: 'ai',
          }),
        });
        savedIds.push(proposal.clientId);
      } catch (cause) {
        failureMessage = cause instanceof Error ? cause.message : 'A task could not be saved.';
      }
    }

    setProposals((current) => current.filter((proposal) => !savedIds.includes(proposal.clientId)));
    setIsSavingProposals(false);

    if (savedIds.length > 0) {
      setIsLoading(true);
      await loadTasks(1);
    }

    if (failureMessage) {
      setAssistantError(`${savedIds.length} saved; some tasks could not be saved. ${failureMessage}`);
    } else {
      setAssistantMessage(`${savedIds.length} task${savedIds.length === 1 ? '' : 's'} saved.`);
    }
  }

  function updateProposal(clientId: string, changes: Partial<TaskProposal>) {
    setProposals((current) => current.map((proposal) => proposal.clientId === clientId ? { ...proposal, ...changes } : proposal));
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="ai-task-assistant-heading" className="space-y-4 border-b border-slate-200 pb-8">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-700" />
            <h2 id="ai-task-assistant-heading" className="text-lg font-semibold text-slate-900">AI Task Assistant</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">Describe a few things you need to do. Review the suggestions before saving them.</p>
        </div>

        <form onSubmit={extractTasks} className="space-y-3">
          <label htmlFor="task-description" className="sr-only">Describe your tasks</label>
          <textarea
            id="task-description"
            value={assistantText}
            onChange={(event) => setAssistantText(event.target.value)}
            maxLength={6000}
            rows={4}
            placeholder="For example: prepare the biology notes by Friday, book a dentist appointment, and review the project budget."
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">{assistantText.length}/6000</span>
            <button type="submit" disabled={isExtracting || isSavingProposals} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
              <Sparkles className="h-4 w-4" /> {isExtracting ? 'Extracting...' : 'Extract Tasks'}
            </button>
          </div>
        </form>

        {assistantError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{assistantError}</p> : null}
        {assistantMessage ? <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{assistantMessage}</p> : null}

        {proposals.length > 0 ? (
          <div className="space-y-3" aria-label="Proposed tasks for review">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-medium text-slate-900">Review proposals</h3>
              <button type="button" onClick={() => void saveSelectedProposals()} disabled={isSavingProposals || isExtracting} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
                <Check className="h-4 w-4" /> {isSavingProposals ? 'Saving...' : `Save Selected Tasks (${proposals.filter((proposal) => proposal.selected).length})`}
              </button>
            </div>
            <ul className="divide-y divide-slate-200 border-y border-slate-200">
              {proposals.map((proposal) => (
                <li key={proposal.clientId} className="grid gap-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_8rem_10rem_auto] sm:items-end">
                  <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 sm:pb-2">
                    <input type="checkbox" checked={proposal.selected} onChange={(event) => updateProposal(proposal.clientId, { selected: event.target.checked })} aria-label={`Select ${proposal.title}`} />
                    <span className="sr-only">Select task</span>
                  </label>
                  <label>
                    <span className="label-text">Title</span>
                    <input value={proposal.title} onChange={(event) => updateProposal(proposal.clientId, { title: event.target.value })} maxLength={200} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
                  </label>
                  <label>
                    <span className="label-text">Priority</span>
                    <select value={proposal.priority} onChange={(event) => updateProposal(proposal.clientId, { priority: event.target.value as TaskPriority })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                    </select>
                  </label>
                  <label>
                    <span className="label-text">Due date</span>
                    <input type="date" value={proposal.dueDate ?? ''} onChange={(event) => updateProposal(proposal.clientId, { dueDate: event.target.value || null })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
                  </label>
                  <button type="button" title="Remove proposal" aria-label={`Remove ${proposal.title}`} onClick={() => setProposals((current) => current.filter((item) => item.clientId !== proposal.clientId))} className="mb-0.5 rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="new-task-heading">
        <h2 id="new-task-heading" className="text-lg font-semibold text-slate-900">New task</h2>
        <form onSubmit={createTask} className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="sm:col-span-2 xl:col-span-3">
            <span className="label-text">Title</span>
            <input name="title" required maxLength={200} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="sm:col-span-2 xl:col-span-3">
            <span className="label-text">Description</span>
            <textarea name="description" maxLength={2000} rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label>
            <span className="label-text">Priority</span>
            <select name="priority" defaultValue="medium" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <label>
            <span className="label-text">Category</span>
            <select name="category" defaultValue="personal" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">
              <option value="study">Study</option><option value="work">Work</option><option value="personal">Personal</option><option value="health">Health</option><option value="other">Other</option>
            </select>
          </label>
          <label>
            <span className="label-text">Due date</span>
            <input name="dueDate" type="date" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <div className="sm:col-span-2 xl:col-span-3">
            <button type="submit" disabled={isSaving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
              <Plus className="h-4 w-4" /> Add task
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="task-list-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="task-list-heading" className="text-lg font-semibold text-slate-900">Your tasks</h2>
          <span className="text-sm text-slate-500">{total} total</span>
        </div>
        {error ? <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {isLoading ? <p className="py-8 text-sm text-slate-500">Loading tasks...</p> : null}
        {!isLoading && tasks.length === 0 ? <p className="py-8 text-sm text-slate-500">No tasks yet.</p> : null}

        <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
          {tasks.map((task) => (
            <li key={task.id} className="py-4">
              {editingTaskId === task.id ? (
                <form
                  className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void updateTask(task.id, formValues(event.currentTarget));
                  }}
                >
                  <label className="sm:col-span-2 xl:col-span-3"><span className="label-text">Title</span><input name="title" defaultValue={task.title} required maxLength={200} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
                  <label className="sm:col-span-2 xl:col-span-3"><span className="label-text">Description</span><textarea name="description" defaultValue={task.description} maxLength={2000} rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
                  <label><span className="label-text">Status</span><select name="status" defaultValue={task.status} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></label>
                  <label><span className="label-text">Priority</span><select name="priority" defaultValue={task.priority} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                  <label><span className="label-text">Category</span><input name="category" defaultValue={task.category} required maxLength={64} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
                  <label><span className="label-text">Due date</span><input name="dueDate" type="date" defaultValue={task.dueDate?.slice(0, 10) ?? ''} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
                  <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-3">
                    <button type="submit" disabled={isSaving} className="btn-primary">Save</button>
                    <button type="button" onClick={() => setEditingTaskId(null)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm"><X className="h-4 w-4" /> Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className={`font-medium ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{task.title}</h3>
                    {task.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{task.description}</p> : null}
                    <p className="mt-2 text-xs text-slate-500">{task.category} · {task.priority} priority · {displayDate(task.dueDate)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="sr-only" htmlFor={`status-${task.id}`}>Status for {task.title}</label>
                    <select id={`status-${task.id}`} value={task.status} onChange={(event) => void changeStatus(task, event.target.value as TaskStatus)} disabled={isSaving} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm">
                      <option value="todo">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
                    </select>
                    <button type="button" title="Edit task" aria-label={`Edit ${task.title}`} onClick={() => setEditingTaskId(task.id)} className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"><Pencil className="h-4 w-4" /></button>
                    <button type="button" title="Delete task" aria-label={`Delete ${task.title}`} onClick={() => void deleteTask(task.id)} className="rounded-md border border-slate-300 p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {total > pageSize ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <button type="button" disabled={page === 1 || isLoading} onClick={() => { setIsLoading(true); void loadTasks(page - 1); }} className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Previous</button>
            <span className="text-sm text-slate-500">Page {page} of {Math.ceil(total / pageSize)}</span>
            <button type="button" disabled={page >= Math.ceil(total / pageSize) || isLoading} onClick={() => { setIsLoading(true); void loadTasks(page + 1); }} className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Next</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}