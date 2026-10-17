import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const taskDatasetPath = path.join(root, 'data', 'evaluation', 'task-extraction-synthetic.json');
const priorityDatasetPath = path.join(root, 'data', 'evaluation', 'task-prioritization-synthetic.json');
const priorities = ['low', 'medium', 'high'];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validProposals(value) {
  return Array.isArray(value) && value.length <= 20 && value.every((proposal) =>
    proposal && typeof proposal === 'object' && !Array.isArray(proposal) &&
    Object.keys(proposal).sort().join(',') === 'dueDate,priority,title' &&
    typeof proposal.title === 'string' && proposal.title.trim().length > 0 &&
    proposal.title.trim().length <= 200 &&
    priorities.includes(proposal.priority) &&
    (proposal.dueDate === null || validDate(proposal.dueDate)));
}

function normalizeTitle(title) {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function expectedDate(value, referenceDate) {
  if (value === '$today') return referenceDate;
  if (value === '$tomorrow') return shiftDate(referenceDate, 1);
  const relative = /^\$in_(\d+)_days$/.exec(value);
  if (relative) return shiftDate(referenceDate, Number(relative[1]));
  return value;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function extractionMetrics(dataset, predictionFile) {
  if (!predictionFile || typeof predictionFile !== 'object' || Array.isArray(predictionFile)) {
    throw new Error('Prediction file must contain a JSON object.');
  }
  if (!validDate(predictionFile.referenceDate)) {
    throw new Error('Predictions must include referenceDate as a valid YYYY-MM-DD date.');
  }
  if (!Array.isArray(predictionFile.taskPredictions)) {
    throw new Error('Predictions must include a taskPredictions array.');
  }

  const predictions = new Map();
  for (const prediction of predictionFile.taskPredictions) {
    if (!prediction || typeof prediction !== 'object' || Array.isArray(prediction) ||
      typeof prediction.id !== 'string' || predictions.has(prediction.id) ||
      !dataset.cases.some((example) => example.id === prediction.id)) {
      throw new Error('taskPredictions must contain unique known case IDs.');
    }
    predictions.set(prediction.id, prediction);
  }
  if (predictions.size !== dataset.cases.length) {
    throw new Error('Provide exactly one task prediction per dataset case, with unique case IDs.');
  }

  let expectedTaskCount = 0;
  let predictedTaskCount = 0;
  let truePositiveCount = 0;
  let correctDateCount = 0;
  let schemaValidCount = 0;
  let expectedSuccessfulCases = 0;
  let failedCaseCount = 0;
  let statusCorrectCount = 0;

  for (const example of dataset.cases) {
    const prediction = predictions.get(example.id);
    if (!prediction || !Number.isInteger(prediction.status)) {
      throw new Error(`Prediction for ${example.id} must include an integer HTTP status.`);
    }

    if (prediction.status === example.expectedStatus) statusCorrectCount += 1;
    if (example.expectedStatus !== 200) continue;

    expectedSuccessfulCases += 1;
    const outputValid = prediction.status === 200 && validProposals(prediction.proposals);
    if (outputValid) schemaValidCount += 1;
    if (prediction.status !== 200) failedCaseCount += 1;

    const proposals = Array.isArray(prediction.proposals) ? prediction.proposals : [];
    expectedTaskCount += example.expectedTasks.length;
    predictedTaskCount += proposals.length;
    const unmatchedExpected = [...example.expectedTasks];

    for (const proposal of proposals) {
      const matchIndex = unmatchedExpected.findIndex((expected) =>
        normalizeTitle(expected.title) === normalizeTitle(String(proposal?.title ?? '')));
      if (matchIndex < 0) continue;

      const [expected] = unmatchedExpected.splice(matchIndex, 1);
      truePositiveCount += 1;
      if (outputValid && proposal.dueDate === expectedDate(expected.dueDate, predictionFile.referenceDate)) {
        correctDateCount += 1;
      }
    }
  }

  return {
    cases: dataset.cases.length,
    expectedSuccessfulCases,
    expectedTaskCount,
    predictedTaskCount,
    matchedTasks: truePositiveCount,
    taskPrecision: predictedTaskCount === 0 ? 0 : truePositiveCount / predictedTaskCount,
    taskRecall: expectedTaskCount === 0 ? 0 : truePositiveCount / expectedTaskCount,
    correctTaskDates: correctDateCount,
    dateExtractionAccuracy: expectedTaskCount === 0 ? 0 : correctDateCount / expectedTaskCount,
    schemaValidOutputRate: expectedSuccessfulCases === 0 ? 0 : schemaValidCount / expectedSuccessfulCases,
    failureRate: expectedSuccessfulCases === 0 ? 0 : failedCaseCount / expectedSuccessfulCases,
    expectedStatusAccuracy: statusCorrectCount / dataset.cases.length,
  };
}

function baselinePriority(example) {
  const importance = { low: 1, medium: 2, high: 3 }[example.priority];
  if (example.status === 'completed') return example.priority;
  let deadline = 0;
  if (typeof example.daysUntilDue === 'number') {
    if (example.daysUntilDue <= 1) deadline = 3;
    else if (example.daysUntilDue <= 3) deadline = 2;
    else if (example.daysUntilDue <= 7) deadline = 1;
  }
  const score = importance + deadline;
  return score >= 3 ? 'high' : score >= 2 ? 'medium' : 'low';
}

function classificationMetrics(examples, predictions) {
  const confusion = Object.fromEntries(priorities.map((label) => [
    label,
    Object.fromEntries(priorities.map((candidate) => [candidate, 0])),
  ]));
  let correct = 0;
  for (const example of examples) {
    const predicted = predictions.get(example.id);
    if (!priorities.includes(predicted)) continue;
    confusion[example.expectedPriority][predicted] += 1;
    if (predicted === example.expectedPriority) correct += 1;
  }
  const count = [...predictions.values()].filter((priority) => priorities.includes(priority)).length;
  const f1Values = priorities.map((label) => {
    const truePositive = confusion[label][label];
    const falsePositive = priorities.reduce((sum, actual) => sum + (actual === label ? 0 : confusion[actual][label]), 0);
    const falseNegative = priorities.reduce((sum, predicted) => sum + (predicted === label ? 0 : confusion[label][predicted]), 0);
    const denominator = (2 * truePositive) + falsePositive + falseNegative;
    return denominator === 0 ? 0 : (2 * truePositive) / denominator;
  });
  return {
    evaluatedCases: count,
    accuracy: count === 0 ? 0 : correct / count,
    macroF1: f1Values.reduce((sum, value) => sum + value, 0) / priorities.length,
    confusionMatrix: confusion,
  };
}

function prioritizationMetrics(dataset, recommendationRows) {
  const byId = new Map(recommendationRows.map((row) => [row.id, row.priority]));
  const baseline = new Map(dataset.cases.map((example) => [example.id, baselinePriority(example)]));
  const labels = new Map(dataset.cases.map((example) => [example.id, example.expectedPriority]));
  return {
    referenceDate: dataset.referenceDate,
    baselineRules: classificationMetrics(dataset.cases, new Map(dataset.cases.map((example) => [example.id, baseline.get(example.id)]))),
    llmRecommendations: recommendationRows.length === 0
      ? null
      : classificationMetrics(dataset.cases, new Map(dataset.cases.map((example) => [example.id, byId.get(example.id)]))),
    labelCount: labels.size,
  };
}

async function createTemplate(outputPath, taskDataset) {
  const template = {
    referenceDate: new Date().toISOString().slice(0, 10),
    taskPredictions: taskDataset.cases.map((example) => ({
      id: example.id,
      status: example.expectedStatus === 400 ? 400 : null,
      proposals: null,
    })),
  };
  await writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Created prediction template: ${outputPath}\n`);
}

export async function main(args = process.argv.slice(2)) {
  const taskDataset = await readJson(taskDatasetPath);
  const priorityDataset = await readJson(priorityDatasetPath);
  const templateIndex = args.indexOf('--template');
  if (templateIndex >= 0) {
    const outputPath = args[templateIndex + 1];
    if (!outputPath) throw new Error('Usage: node scripts/evaluate-ai.mjs --template <new-predictions.json>');
    await createTemplate(path.resolve(root, outputPath), taskDataset);
    return;
  }

  const priorityOnly = args.includes('--prioritization-only');
  const result = {
    dataset: { taskExtractionCases: taskDataset.cases.length, prioritizationCases: priorityDataset.cases.length },
    prioritization: prioritizationMetrics(priorityDataset, []),
  };

  if (!priorityOnly) {
    const predictionIndex = args.indexOf('--predictions');
    const predictionPath = predictionIndex >= 0 ? args[predictionIndex + 1] : undefined;
    if (!predictionPath) {
      throw new Error('Usage: node scripts/evaluate-ai.mjs --predictions <completed-predictions.json> [--prioritization-only]');
    }
    const predictionFile = await readJson(path.resolve(root, predictionPath));
    if (!predictionFile || typeof predictionFile !== 'object' || Array.isArray(predictionFile)) {
      throw new Error('Prediction file must contain a JSON object.');
    }
    result.taskExtraction = extractionMetrics(taskDataset, predictionFile);
    if (Object.hasOwn(predictionFile, 'priorityRecommendations')) {
      if (!Array.isArray(predictionFile.priorityRecommendations)) {
        throw new Error('priorityRecommendations must be an array when supplied.');
      }
      const recommendationIds = new Set();
      for (const recommendation of predictionFile.priorityRecommendations) {
        if (!recommendation || typeof recommendation.id !== 'string' ||
          !priorities.includes(recommendation.priority) || recommendationIds.has(recommendation.id) ||
          !priorityDataset.cases.some((example) => example.id === recommendation.id)) {
          throw new Error('priorityRecommendations must contain unique known case IDs and low, medium, or high priorities.');
        }
        recommendationIds.add(recommendation.id);
      }
      result.prioritization = prioritizationMetrics(priorityDataset, predictionFile.priorityRecommendations);
    }
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Evaluation failed.'}\n`);
    process.exitCode = 1;
  });
}
