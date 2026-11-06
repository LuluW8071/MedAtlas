import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const corpusPath = fileURLToPath(new URL('../../../assets/knowledge_base.txt', import.meta.url));

export const normalize = (text: string) => text
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .toLowerCase().replace(/\s+/g, ' ').trim();

/** Every `# topic` block of the corpus as [title, markdown]. */
export function corpusTopics(): Array<[string, string]> {
  return readFileSync(corpusPath, 'utf8')
    .split(/^(?=# )/m)
    .filter(block => block.startsWith('# '))
    .map(block => [block.slice(2, block.indexOf('\n')).trim(), block]);
}
