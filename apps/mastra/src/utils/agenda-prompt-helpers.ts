/**
 * Prompt helper functions for the Agenda Agent (Feature 20).
 *
 * These utilities format task data for the LLM prompt, validate
 * section structure in generated content, and handle date formatting.
 */

/** Maximum completed tasks to include in the prompt (token budget guard). */
const MAX_COMPLETED_TASKS = 30;
/** Maximum incomplete tasks to include in the prompt (token budget guard). */
const MAX_INCOMPLETE_TASKS = 20;
/** Maximum characters for task context in the prompt. */
const MAX_CONTEXT_LENGTH = 300;

/**
 * Required section headers that must appear in the generated Running Notes.
 */
export const REQUIRED_SECTIONS = [
  '## Completed Tasks',
  '## Incomplete Tasks',
  '## Relevant Deliverables',
  '## Recommendations',
  '## New Ideas',
  '## Next Steps',
] as const;

/**
 * Shape of a reconciled task used by the prompt builder.
 * Matches the fields returned by getReconciledTasksTool.
 */
export interface PromptTask {
  shortId: string;
  title: string;
  description: {
    taskContext: string;
    additionalContext: string;
    requirements: string[] | string;
  };
  assignee: string | null;
  estimatedTime: string | null;
  scrumStage: string;
  asanaStatus: 'completed' | 'incomplete' | 'not_found';
  asanaCompleted: boolean | null;
  asanaCompletedAt: string | null;
}

/**
 * Formats an ISO 8601 date string to a human-readable format.
 *
 * @example formatDate('2026-02-01') // 'February 1, 2026'
 * @example formatDate('2026-12-25') // 'December 25, 2026'
 */
export function formatDate(isoDate: string): string {
  // Parse the date parts directly to avoid timezone issues
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);
  const day = parseInt(dayStr!, 10);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return `${monthNames[month - 1]} ${day}, ${year}`;
}

/**
 * Formats a cycle date range for display in the document header.
 *
 * Same month:   "February 1 - 28, 2026"
 * Cross month:  "January 15 - February 14, 2026"
 *
 * Uses an en-dash between dates.
 */
export function formatCycleRange(cycleStart: string, cycleEnd: string): string {
  const [startYear, startMonth, startDay] = cycleStart.split('-').map(Number) as [number, number, number];
  const [endYear, endMonth, endDay] = cycleEnd.split('-').map(Number) as [number, number, number];

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const startMonthName = monthNames[startMonth - 1]!;
  const endMonthName = monthNames[endMonth - 1]!;

  if (startYear === endYear && startMonth === endMonth) {
    // Same month: "February 1 \u2013 28, 2026"
    return `${startMonthName} ${startDay} \u2013 ${endDay}, ${endYear}`;
  }

  // Cross month or cross year: "January 15 \u2013 February 14, 2026"
  if (startYear === endYear) {
    return `${startMonthName} ${startDay} \u2013 ${endMonthName} ${endDay}, ${endYear}`;
  }

  // Cross year (edge case): "December 15, 2025 \u2013 January 14, 2026"
  return `${startMonthName} ${startDay}, ${startYear} \u2013 ${endMonthName} ${endDay}, ${endYear}`;
}

/**
 * Validates that the generated content contains all six required section headers.
 *
 * @returns An object with `valid` boolean and `missing` array of section header strings.
 */
export function validateSections(content: string): { valid: boolean; missing: string[] } {
  const missing = REQUIRED_SECTIONS.filter((s) => !content.includes(s));
  return { valid: missing.length === 0, missing };
}

/**
 * Formats a single task for inclusion in the LLM prompt.
 */
function formatTask(task: PromptTask): string {
  let line = `- [${task.shortId}] ${task.title}`;
  if (task.assignee) {
    line += ` (Assignee: ${task.assignee})`;
  }
  if (task.estimatedTime) {
    line += ` (Est: ${task.estimatedTime})`;
  }

  const context = task.description.taskContext.slice(0, MAX_CONTEXT_LENGTH);
  line += `\n  Context: ${context}`;

  return line;
}

/**
 * Builds the user message portion of the LLM prompt from task data.
 *
 * Enforces a 50-task limit (30 completed + 20 incomplete) for V1.
 * Tasks are sorted by asanaCompletedAt descending before truncation
 * (most recently completed first).
 *
 * @param clientName - Display name of the client
 * @param cycleStart - ISO 8601 date string for cycle start
 * @param cycleEnd - ISO 8601 date string for cycle end
 * @param completedTasks - Tasks classified as completed
 * @param incompleteTasks - Tasks classified as incomplete
 * @returns Formatted prompt string
 */
export function buildAgendaPrompt(
  clientName: string,
  cycleStart: string,
  cycleEnd: string,
  completedTasks: PromptTask[],
  incompleteTasks: PromptTask[],
): string {
  let truncatedCompleted = completedTasks;
  let truncatedIncomplete = incompleteTasks;

  // Sort completed tasks by asanaCompletedAt descending (most recent first)
  truncatedCompleted = [...truncatedCompleted].sort((a, b) => {
    const aDate = a.asanaCompletedAt ?? '';
    const bDate = b.asanaCompletedAt ?? '';
    return bDate.localeCompare(aDate);
  });

  // Enforce 50-task limit guard
  if (truncatedCompleted.length > MAX_COMPLETED_TASKS || truncatedIncomplete.length > MAX_INCOMPLETE_TASKS) {
    console.warn('[agenda-agent] Task limit hit', {
      originalCompleted: completedTasks.length,
      originalIncomplete: incompleteTasks.length,
      truncatedCompleted: Math.min(truncatedCompleted.length, MAX_COMPLETED_TASKS),
      truncatedIncomplete: Math.min(truncatedIncomplete.length, MAX_INCOMPLETE_TASKS),
    });
    truncatedCompleted = truncatedCompleted.slice(0, MAX_COMPLETED_TASKS);
    truncatedIncomplete = truncatedIncomplete.slice(0, MAX_INCOMPLETE_TASKS);
  }

  const cycleRange = formatCycleRange(cycleStart, cycleEnd);

  return [
    `Client: ${clientName}`,
    `Cycle: ${cycleRange}`,
    '',
    `COMPLETED TASKS (${truncatedCompleted.length} total):`,
    truncatedCompleted.map(formatTask).join('\n'),
    '',
    `INCOMPLETE TASKS (${truncatedIncomplete.length} total):`,
    truncatedIncomplete.length > 0
      ? truncatedIncomplete.map(formatTask).join('\n')
      : '(None)',
  ].join('\n');
}
