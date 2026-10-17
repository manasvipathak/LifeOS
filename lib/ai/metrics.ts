export type AIOperation = 'task_extraction' | 'task_prioritization' | 'weekly_report' | 'daily_planning';
export type AIProvider = 'google' | 'openai';

export type AIOperationMetric = {
  operation: AIOperation;
  provider: AIProvider;
  outcome: 'success' | 'failure' | 'timeout';
  durationMs: number;
  schemaValidationFailure?: boolean;
  inputTokens?: number;
  outputTokens?: number;
};

type AIProviderCounters = {
  successes: number;
  failures: number;
  timeouts: number;
  schemaValidationFailures: number;
  totalDurationMs: number;
  inputTokens: number;
  outputTokens: number;
  requestsWithTokenUsage: number;
};

type AIMetricStore = Record<string, AIProviderCounters>;

const globalForAIMetrics = globalThis as typeof globalThis & {
  lifeosAIMetrics?: AIMetricStore;
};

function newCounters(): AIProviderCounters {
  return {
    successes: 0,
    failures: 0,
    timeouts: 0,
    schemaValidationFailures: 0,
    totalDurationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    requestsWithTokenUsage: 0,
  };
}

export function recordAIOperation(metric: AIOperationMetric): void {
  const store = globalForAIMetrics.lifeosAIMetrics ??= {};
  const key = `${metric.operation}:${metric.provider}`;
  const counters = store[key] ??= newCounters();
  counters.totalDurationMs += Math.max(0, Math.round(metric.durationMs));

  if (metric.outcome === 'success') counters.successes += 1;
  else counters.failures += 1;
  if (metric.outcome === 'timeout') counters.timeouts += 1;
  if (metric.schemaValidationFailure) counters.schemaValidationFailures += 1;

  const hasInputTokens = Number.isSafeInteger(metric.inputTokens) && (metric.inputTokens ?? -1) >= 0;
  const hasOutputTokens = Number.isSafeInteger(metric.outputTokens) && (metric.outputTokens ?? -1) >= 0;
  if (hasInputTokens || hasOutputTokens) {
    counters.requestsWithTokenUsage += 1;
    if (hasInputTokens) counters.inputTokens += metric.inputTokens!;
    if (hasOutputTokens) counters.outputTokens += metric.outputTokens!;
  }

  console.info('[lifeos-ai-metric]', {
    operation: metric.operation,
    provider: metric.provider,
    outcome: metric.outcome,
    durationMs: Math.max(0, Math.round(metric.durationMs)),
    schemaValidationFailure: metric.schemaValidationFailure ?? false,
    cumulative: { ...counters },
  });
}
