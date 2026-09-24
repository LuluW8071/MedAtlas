import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const promptCache = new Map<string, Promise<string>>();

async function readPromptFile(promptName: string): Promise<string> {
  const directories = [
    join(process.cwd(), 'src/agent/prompt'),
    join(process.cwd(), 'server/src/agent/prompt'),
    join(process.cwd(), 'dist/src/agent/prompt'),
    join(process.cwd(), 'server/dist/src/agent/prompt'),
  ];

  for (const directory of directories) {
    try {
      return await readFile(join(directory, promptName), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  throw new Error(`Prompt file not found: ${promptName}`);
}

/** Load each Markdown prompt once and retain its contents in memory. */
export function loadPrompt(promptName: string): Promise<string> {
  const cachedPrompt = promptCache.get(promptName);
  if (cachedPrompt) return cachedPrompt;

  const prompt = readPromptFile(promptName).catch(error => {
    promptCache.delete(promptName);
    throw error;
  });
  promptCache.set(promptName, prompt);
  return prompt;
}

/** Render placeholders without re-reading cached prompt files. */
export function renderPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/{{([a-z_]+)}}/g, (_match, key: string) => values[key] ?? '');
}

export async function buildAgentPrompt(guardrailNotice: string): Promise<string> {
  const agentPrompt = await loadPrompt('agent_node.md');
  const runtime = runtimeValues();

  return renderPrompt(agentPrompt, {
    ...runtime,
    guardrail_notice: guardrailNotice || 'No additional input safety notice.',
  });
}

export async function buildRefinerPrompt(
  retrievedContext: string,
  userQuery: string,
): Promise<string> {
  const refinerPrompt = await loadPrompt('refiner_node.md');
  return renderPrompt(refinerPrompt, {
    ...runtimeValues(),
    retrieved_context: retrievedContext || 'No retrieved evidence is available.',
    user_query: userQuery,
  });
}

function runtimeValues(): Record<string, string> {
  const now = new Date();
  const timezone = 'Asia/Kathmandu';
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: timezone,
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeStyle: 'long',
    timeZone: timezone,
  });

  return {
    current_date: dateFormatter.format(now),
    current_time: timeFormatter.format(now),
    timezone,
  };
}
