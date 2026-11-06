import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';

import { logger } from '../../config/logger.js';
import { contextMessages } from '../context.js';
import { chatModel } from '../model.js';
import { messageText } from '../message_text.js';
import { buildBookingPrompt } from '../prompt/prompt_loader.js';
import { bookingTools } from '../tools/index.js';
import type { AgentState } from '../state.js';

// One operation per turn; the node runs it directly, with no model-tool loop.
const modelWithTools = chatModel.bindTools(bookingTools, { parallel_tool_calls: false });
const toolsByName: Record<string, StructuredToolInterface> = Object.fromEntries(bookingTools.map(tool => [tool.name, tool]));

function confirmedAppointmentContext(messages: AgentState['messages']): string {
  const calls = new Map<string, { name: string; args: Record<string, unknown> }>();
  const appointments = new Map<string, string>();

  for (const message of messages) {
    if (message instanceof AIMessage) {
      for (const call of message.tool_calls ?? []) {
        if (call.id) calls.set(call.id, { name: call.name, args: call.args });
      }
      continue;
    }
    if (!(message instanceof ToolMessage)) continue;

    const call = calls.get(message.tool_call_id);
    if (!call || !['book_appointment', 'cancel_appointment', 'reschedule_appointment'].includes(call.name)) continue;
    const email = typeof call.args.email === 'string' ? call.args.email : '';
    if (!email) continue;

    try {
      const toolResult = typeof message.content === 'string' ? message.content : message.content.map(String).join('');
      const result = JSON.parse(toolResult) as { ok?: boolean };
      if (!result.ok) continue;
      const operation = call.name === 'cancel_appointment' ? 'successfully cancelled' : 'currently scheduled';
      appointments.set(email, `- Appointment associated with ${email} is ${operation}.`);
    } catch {
      continue;
    }
  }

  return [...appointments.values()].join('\n');
}

/** One tool-calling turn: ask for missing details, or run the chosen operation and report its result in natural language. */
export async function bookingNode(state: AgentState) {
  logger.info({ messageCount: state.messages.length }, 'booking node start');

  const basePrompt = await buildBookingPrompt(state.guardrailNotice);
  const history = contextMessages(state);
  const appointmentContext = confirmedAppointmentContext(history);
  const systemPrompt = appointmentContext
    ? `${basePrompt}\n\n## Confirmed appointment context\n${appointmentContext}\nUse this verified conversation context when the latest request refers to one of these appointments. Ask for identifying information only when context remains ambiguous.`
    : basePrompt;
  const response = await modelWithTools.invoke([
    { role: 'system', content: systemPrompt },
    ...history,
  ]);

  const [call] = response.tool_calls ?? [];
  // No tool call: the model is asking for missing details or declining.
  if (!call) {
    logger.info('booking node asking for details');
    return { messages: [response], retrievedContext: '', refinedContext: messageText(response), citations: [] };
  }

  const output = await toolsByName[call.name].invoke(call);
  // One more model call, without tools, so the reply is worded naturally from the tool result.
  const followUp = await chatModel.invoke([
    { role: 'system', content: systemPrompt },
    ...history,
    response,
    output,
  ]);
  const reply = messageText(followUp) || messageText(output);
  logger.info({ tool: call.name, reply }, 'booking node done');

  // Keep the call and its result in history so later turns can reuse the confirmed email.
  return {
    messages: [response, output, followUp],
    retrievedContext: '',
    refinedContext: reply,
    citations: [],
  };
}
