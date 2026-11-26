/**
 * Generate tests/data/retrieval_eval.json: patient-style questions per sampled topic, each with a
 * verbatim quote that answers it. Run once (needs OPENAI_API_KEY), review the file, commit it.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import '../src/config/env.js'; // loads .env before the model reads its key
import { chatModel } from '../src/agent/model.js';
import { corpusTopics, normalize } from '../tests/helper/eval_corpus.js';

const TOPIC_STRIDE = 11; // ~150 topics: enough distractors, cheap enough to embed per profile

const schema = z.object({
  question: z.string().describe('Question a patient might ask; must not contain the topic title'),
  quote: z.string().describe('Verbatim passage (6-20 words) from the text that answers the question'),
});
const generator = chatModel.withStructuredOutput(schema, { name: 'eval_question' });

async function main() {
  const topics = corpusTopics().filter((_, i) => i % TOPIC_STRIDE === 0);
  const questions: Array<{ question: string; topic: string; quote: string }> = [];

  for (const [title, markdown] of topics) {
    const sections = markdown.split(/^## /m).slice(1).filter(section => section.split(/\s+/).length >= 80);
    if (!sections.length) continue;
    const section = sections[title.length % sections.length].slice(0, 3000);

    const { question, quote } = await generator.invoke(
      `Medical topic: ${title}\n\nText:\n${section}\n\nWrite one natural, self-contained question a patient might ask (it must make sense without seeing the text, so never say "this condition", "this test" or similar), answered by a specific passage of the text, plus that passage copied exactly, character for character. Do not use the topic title in the question.`,
    );
    if (!normalize(section).includes(normalize(quote)) || normalize(question).includes(normalize(title)) || /\b(this|these)\b/i.test(question)) continue;
    questions.push({ question, topic: title, quote });
  }

  const output = fileURLToPath(new URL('../tests/data/retrieval_eval.json', import.meta.url));
  writeFileSync(output, `${JSON.stringify({ topics: topics.map(([title]) => title), questions }, null, 2)}\n`);
  console.log(`${questions.length} questions over ${topics.length} topics -> ${output}`);
}

void main();
