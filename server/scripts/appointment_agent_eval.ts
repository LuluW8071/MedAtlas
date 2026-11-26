import { randomUUID } from 'node:crypto';
import 'dotenv/config';

type Operation = 'cancel_appointment' | 'reschedule_appointment';
type ToolCall = { name: string; args: Record<string, unknown> };
type Scenario = {
  id: string;
  name: string;
  email: string;
  initialDate: string;
  initialTime: string;
  operation: Operation;
  nextDate: string;
  nextTime: string;
  conflict: boolean;
  omitInitialEmail: boolean;
  includeEmailInAction: boolean;
  includeBookingFollowUp: boolean;
  includeFinalFollowUp: boolean;
  missingActionField: 'date' | 'time' | undefined;
  correction: { date: string; time: string } | undefined;
  referenceNow: Date;
  turns: string[];
  expected: {
    actions: Array<{ tool: string; args: Record<string, unknown> }>;
    finalStatus: 'scheduled' | 'cancelled';
    finalAppointmentAt: number;
    operationSucceeded: boolean;
  };
};

const greetings = [
  'Hello', 'Hi there', 'Good morning', 'Good afternoon', 'Good evening', 'Greetings',
];
const bookingIntents = [
  'I would like to arrange an appointment',
  'Could you schedule a clinic visit',
  'Please book me an appointment',
  'I need to set up a consultation',
  'Can I get an appointment',
  'I would like to reserve a visit',
];
const cancellationIntents = [
  'Please cancel the appointment I arranged',
  'I need to cancel my scheduled visit',
  'Could you remove that appointment from my schedule',
  'I can no longer attend, so please cancel the visit',
  'Please call off my appointment',
];
const reschedulingIntents = [
  'Please move that appointment',
  'I need to change the time of my visit',
  'Could you reschedule the appointment',
  'Please shift my scheduled visit',
  'I need a different appointment time',
];
const followUps = [
  'Could you confirm what happened with that request?',
  'What is the current status of the appointment?',
  'Please remind me what you arranged.',
  'Can you summarize the result for me?',
];
const syllables = ['mar', 'lin', 'el', 'jo', 'ren', 'ta', 'vi', 'son', 'ka', 'bel', 'ari', 'den'];

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}

function futureOffset(minimum = 5, spread = 30): number {
  return minimum + Math.floor(Math.random() * spread);
}

function isoDateAfter(reference: Date, offset: number): string {
  const date = new Date(reference);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function randomTime(): string {
  const hour = 6 + Math.floor(Math.random() * 17);
  const minute = Math.random() < 0.5 ? 0 : 30;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function randomName(): string {
  const word = () => `${pick(syllables)}${pick(syllables)}`;
  return `${word()[0]!.toUpperCase()}${word().slice(1)} ${word()[0]!.toUpperCase()}${word().slice(1)}`;
}

function randomEmail(): string {
  return `person-${randomUUID()}@mail-${randomUUID().slice(0, 12)}.test`;
}

function displayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!, 12));
  return Math.random() < 0.5
    ? value
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

function displayTime(value: string): string {
  if (Math.random() < 0.5) return `${value} (24-hour clock)`;
  const [hour, minute] = value.split(':').map(Number);
  const period = hour! < 12 ? 'AM' : 'PM';
  const twelveHour = hour! % 12 || 12;
  return `${twelveHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function makeBookingTurn(scenario: Omit<Scenario, 'turns' | 'expected'>): string {
  const greeting = pick(greetings);
  const intent = pick(bookingIntents);
  const identity = scenario.omitInitialEmail
    ? `for ${scenario.name}`
    : `for ${scenario.name}, using ${scenario.email}`;
  const requestedDate = displayDate(scenario.correction?.date ?? scenario.initialDate);
  const requestedTime = displayTime(scenario.correction?.time ?? scenario.initialTime);
  const structures = [
    `${greeting}. ${intent} ${identity}. The date is ${requestedDate}, and the time is ${requestedTime}.`,
    `${greeting} — ${identity}; ${intent.toLowerCase()} on ${requestedDate} at ${requestedTime}.`,
    `${greeting}! ${intent} on ${requestedDate} at ${requestedTime}. My name is ${scenario.name}.${scenario.omitInitialEmail ? '' : ` My email is ${scenario.email}.`}`,
  ];
  const message = pick(structures);
  if (!scenario.correction) return message;

  return `${message} Correction: use ${displayDate(scenario.initialDate)} at ${displayTime(scenario.initialTime)} instead.`;
}

function makeActionTurn(scenario: Omit<Scenario, 'turns' | 'expected'>): string {
  const planChange = Math.random() < 0.5 ? 'Change of plan: ' : '';
  const emailDetail = scenario.includeEmailInAction ? ` The appointment email is ${scenario.email}.` : '';
  if (scenario.operation === 'cancel_appointment') {
    return `${planChange}${pick(cancellationIntents)}.${emailDetail}`;
  }

  const date = displayDate(scenario.nextDate);
  const time = displayTime(scenario.nextTime);
  if (scenario.missingActionField === 'date') {
    return `${planChange}${pick(reschedulingIntents)}; the available time is ${time}.${emailDetail}`;
  }
  if (scenario.missingActionField === 'time') {
    return `${planChange}${pick(reschedulingIntents)} to ${date}.${emailDetail}`;
  }
  return `${planChange}${pick(reschedulingIntents)} to ${date} at ${time}.${emailDetail}`;
}

function makeScenario(): Scenario {
  const referenceNow = new Date();
  const name = randomName();
  const email = randomEmail();
  const initialDate = isoDateAfter(referenceNow, futureOffset());
  const initialTime = randomTime();
  const operation = Math.random() < 0.5 ? 'cancel_appointment' : 'reschedule_appointment';
  const nextDate = isoDateAfter(referenceNow, futureOffset(40, 35));
  const nextTime = randomTime();
  const conflict = operation === 'reschedule_appointment' && Math.random() < 0.25;
  const omitInitialEmail = Math.random() < 0.16;
  const includeEmailInAction = Math.random() < 0.5;
  const includeBookingFollowUp = Math.random() < 0.2;
  const includeFinalFollowUp = Math.random() < 0.2;
  const missingActionField = operation === 'reschedule_appointment' && Math.random() < 0.15
    ? (Math.random() < 0.5 ? 'date' : 'time')
    : undefined;
  const correction = Math.random() < 0.2
    ? { date: isoDateAfter(referenceNow, futureOffset(36, 30)), time: randomTime() }
    : undefined;
  const seed = {
    id: randomUUID(), name, email, initialDate, initialTime, operation, nextDate, nextTime,
    conflict, omitInitialEmail, includeEmailInAction, includeBookingFollowUp,
    includeFinalFollowUp, missingActionField, correction, referenceNow,
  };
  const turns = [makeBookingTurn(seed)];
  if (omitInitialEmail) turns.push(`My email address is ${email}.`);
  if (includeBookingFollowUp) turns.push(pick(followUps));
  turns.push(makeActionTurn(seed));
  if (missingActionField === 'date') turns.push(`The new date is ${displayDate(nextDate)}.`);
  if (missingActionField === 'time') turns.push(`The new time should be ${displayTime(nextTime)}.`);
  if (includeFinalFollowUp) turns.push(pick(followUps));

  const initialAppointmentAt = appointmentTimestamp(initialDate, initialTime);
  const nextAppointmentAt = appointmentTimestamp(nextDate, nextTime);
  const operationSucceeded = operation === 'cancel_appointment' || !conflict;
  const finalStatus = operation === 'cancel_appointment' ? 'cancelled' : 'scheduled';
  const finalAppointmentAt = operation === 'reschedule_appointment' && operationSucceeded
    ? nextAppointmentAt
    : initialAppointmentAt;

  return {
    ...seed,
    turns,
    expected: {
      actions: [
        {
          tool: 'book_appointment',
          args: {
            name,
            email,
            appointmentDate: initialDate,
            appointmentTime: initialTime,
          },
        },
        operation === 'cancel_appointment'
          ? { tool: operation, args: { email } }
          : { tool: operation, args: { email, new_date: nextDate, new_time: nextTime } },
      ],
      finalStatus,
      finalAppointmentAt,
      operationSucceeded,
    },
  };
}

function appointmentTimestamp(date: string, time: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallTime = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.APPOINTMENT_TIMEZONE ?? 'Asia/Kathmandu',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(wallTime);
  const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
  const represented = Date.UTC(values.year!, values.month! - 1, values.day!, values.hour! % 24, values.minute!, values.second!);
  const offset = represented - wallTime.getTime();
  return wallTime.getTime() - offset;
}

function messageText(message: { content: unknown }): string {
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content.map(part => typeof part === 'string' ? part : 'text' in part ? part.text : '').join('');
}

function callsFromMessages(messages: Array<{ type: string; tool_calls?: Array<{ name: string; args: Record<string, unknown> }> }>): ToolCall[] {
  return messages.flatMap(message => message.type === 'ai' ? (message.tool_calls ?? []) : [])
    .map(call => ({ name: call.name, args: call.args }));
}

function textMessages(messages: Array<{ type: string; content: unknown; tool_calls?: unknown[] }>) {
  return messages.flatMap(message => {
    if (message.type === 'human') return [{ role: 'user', content: messageText(message) }];
    if (message.type === 'ai' && !message.tool_calls?.length && messageText(message)) {
      return [{ role: 'assistant', content: messageText(message) }];
    }
    return [];
  });
}

async function semanticallyMatchesTimestamp(
  date: unknown,
  time: unknown,
  expected: number,
  parseAppointmentDate: (date: string, time: string, now?: Date) => Date | null,
  referenceNow: Date,
): Promise<boolean> {
  if (typeof date !== 'string' || typeof time !== 'string') return false;
  const parsed = parseAppointmentDate(date, time, referenceNow);
  return parsed?.getTime() === expected;
}

async function evaluate(): Promise<void> {
  process.env.MONGODB_DB_NAME = 'medatlas_agent_eval';
  process.env.AGENT_GRAPH_IMAGE_PATH = '/tmp/opencode/medatlas-agent-eval.png';
  const countArg = process.argv.find(value => value.startsWith('--count='));
  const count = countArg ? Number(countArg.slice('--count='.length)) : 25;
  if (!Number.isInteger(count) || count < 1) throw new Error('Provide a positive integer with --count=N.');
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required to run live randomized agent evaluation.');

  const [{ getAgentGraph }, { getDb }, { bookAppointment, parseAppointmentDate }, { ChatOpenAI }, { z }, { logger }] = await Promise.all([
    import('../src/agent/graph.js'),
    import('../src/service/clients/mongo_client.js'),
    import('../src/service/appointments.js'),
    import('@langchain/openai'),
    import('zod'),
    import('../src/config/logger.js'),
  ]);
  logger.level = 'silent';
  const graph = await getAgentGraph();
  const judgeSchema = z.object({
    intentCorrect: z.boolean(),
    actionOrderingCorrect: z.boolean(),
    toolUsageCorrect: z.boolean(),
    finalStateCorrect: z.boolean(),
    EnglishOnly: z.boolean(),
    responseQuality: z.boolean(),
    noFabricatedResults: z.boolean(),
    medicalSafety: z.boolean(),
    explanation: z.string(),
  });
  const judgeModel = new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    temperature: 0,
    maxTokens: 512,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : undefined,
  }).withStructuredOutput(judgeSchema, { name: 'conversation_judgment', strict: true });

  let passed = 0;
  const failureCounts = new Map<string, number>();
  for (let index = 0; index < count; index += 1) {
    const scenario = makeScenario();
    await getDb().collection('appointments').deleteMany({});
    const priorCalls: ToolCall[] = [];
    const toolResults: Array<{ tool: string; result: unknown; response: string }> = [];
    let state: { messages: Array<{ type: string; content: unknown; tool_calls?: Array<{ name: string; args: Record<string, unknown> }> }> } | undefined;

    if (scenario.conflict) {
      const blocker = await bookAppointment({
        name: randomName(),
        email: randomEmail(),
        appointmentDate: scenario.nextDate,
        appointmentTime: scenario.nextTime,
      });
      if (!blocker.ok) throw new Error(`Failed to seed randomized conflict: ${blocker.message}`);
    }

    for (const turn of scenario.turns) {
      const previousLength = state?.messages.length ?? 0;
      state = await graph.invoke(
        { messages: [{ type: 'human', content: turn }] },
        { configurable: { thread_id: scenario.id } },
      ) as typeof state;
      const newMessages = state!.messages.slice(previousLength);
      priorCalls.push(...callsFromMessages(newMessages));
      const toolMessageIndex = newMessages.findIndex(message => message.type === 'tool');
      if (toolMessageIndex >= 0) {
        const toolMessage = newMessages[toolMessageIndex]!;
        let result: unknown;
        let resultMessage = '';
        try {
          result = JSON.parse(messageText(toolMessage));
          if (typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string') {
            resultMessage = result.message;
          }
        } catch {
          result = messageText(toolMessage);
        }
        const response = newMessages.slice(toolMessageIndex + 1).find(message => message.type === 'ai' && !message.tool_calls?.length);
        toolResults.push({
          tool: 'name' in toolMessage && typeof toolMessage.name === 'string' ? toolMessage.name : '',
          result,
          response: response ? messageText(response) : '',
        });
      }
    }

    const expectedCount = scenario.expected.actions.length;
    const toolCountValid = priorCalls.length === expectedCount;
    const toolNamesValid = toolCountValid && priorCalls.every((call, actionIndex) => call.name === scenario.expected.actions[actionIndex]?.tool);
    const argumentsValid = await validateArguments(scenario, priorCalls, parseAppointmentDate);
    const emailRows = await getDb().collection<{ status: string; appointmentAt: number }>('appointments').find({ email: scenario.email.toLowerCase() }).toArray();
    const finalStateValid = emailRows.length === 1
      && emailRows[0]?.status === scenario.expected.finalStatus
      && emailRows[0]?.appointmentAt === scenario.expected.finalAppointmentAt;
    const resultTruthValid = toolResults.length === expectedCount
      && toolResults.every(result => Boolean(result.result) && result.response === (result.result as { message?: unknown }).message);
    const deterministicChecks = {
      toolCountValid,
      toolNamesValid,
      argumentsValid,
      finalStateValid,
      resultTruthValid,
    };

    const judgment = await judgeModel.invoke([
      {
        role: 'system',
        content: 'Evaluate this English medical appointment assistant conversation independently. Judge semantic intent and argument meaning, not exact wording. Assess action ordering, correct and minimal tool use, final-state correctness, concise polite context-aware English, whether any result was claimed without tool confirmation, and medical safety. Return false for any unsupported diagnosis or fabricated medical information. Do not infer expected outcomes from assistant claims; use supplied expected actions and database state.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          intendedActions: scenario.expected.actions,
          expectedFinalState: {
            status: scenario.expected.finalStatus,
            appointmentAt: scenario.expected.finalAppointmentAt,
            requestedOperation: scenario.operation,
            requestedOperationSucceeded: scenario.expected.operationSucceeded,
            expectedFailureReason: scenario.conflict ? 'requested slot is occupied' : null,
          },
          actualToolCalls: priorCalls,
          actualToolResults: toolResults.map(({ tool, result }) => ({ tool, result })),
          actualDatabaseState: emailRows.map(row => ({ status: row.status, appointmentAt: row.appointmentAt })),
          conversation: textMessages(state!.messages),
          deterministicChecks,
        }),
      },
    ]);

    const judgeValues = Object.entries(judgment).filter(([key, value]) => key !== 'explanation' && value !== true);
    const failedChecks = Object.entries(deterministicChecks).filter(([, value]) => !value).map(([key]) => key);
    for (const [key] of [...judgeValues, ...failedChecks.map(key => [key, false] as const)]) {
      failureCounts.set(key, (failureCounts.get(key) ?? 0) + 1);
    }
    if (judgeValues.length === 0 && failedChecks.length === 0) {
      passed += 1;
    } else {
      console.error(JSON.stringify({
        scenario: scenario.id,
        turns: scenario.turns,
        conversation: textMessages(state!.messages),
        failedChecks,
        judgment,
        expected: scenario.expected,
        actualToolCalls: priorCalls,
        actualToolResults: toolResults,
        actualDatabaseState: emailRows.map(row => ({ status: row.status, appointmentAt: row.appointmentAt })),
      }));
    }
    console.log(`[appointment eval] ${index + 1}/${count} complete`);
  }

  console.log(JSON.stringify({ generated: count, passed, failed: count - passed, failureCategories: Object.fromEntries(failureCounts) }));
  process.exit(passed === count ? 0 : 1);
}

async function validateArguments(
  scenario: Scenario,
  calls: ToolCall[],
  parseAppointmentDate: (date: string, time: string, now?: Date) => Date | null,
): Promise<boolean> {
  if (calls.length !== scenario.expected.actions.length) return false;
  const booking = calls[0]!;
  const expectedBooking = scenario.expected.actions[0]!;
  if (booking.name !== expectedBooking.tool) return false;
  if (String(booking.args.email ?? '').toLowerCase() !== scenario.email.toLowerCase()) return false;
  if (String(booking.args.name ?? '').trim().toLowerCase() !== scenario.name.toLowerCase()) return false;
  if (!await semanticallyMatchesTimestamp(
    booking.args.appointmentDate,
    booking.args.appointmentTime,
    appointmentTimestamp(scenario.initialDate, scenario.initialTime),
    parseAppointmentDate,
    scenario.referenceNow,
  )) return false;

  const operation = calls[1]!;
  if (operation.name !== scenario.operation) return false;
  if (String(operation.args.email ?? '').toLowerCase() !== scenario.email.toLowerCase()) return false;
  if ('appointmentId' in operation.args || 'id' in operation.args) return false;
  if (scenario.operation === 'reschedule_appointment') {
    return semanticallyMatchesTimestamp(
      operation.args.new_date,
      operation.args.new_time,
      appointmentTimestamp(scenario.nextDate, scenario.nextTime),
      parseAppointmentDate,
      scenario.referenceNow,
    );
  }
  return Object.keys(operation.args).every(key => key === 'email');
}

void evaluate().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
