import { writeFile } from 'node:fs/promises';
import type { CompiledStateGraph } from '@langchain/langgraph';

import { logger } from '../../src/config/logger.js';

/** Export compiled LangGraph diagram as Mermaid PNG. */
export async function showAndSaveGraph(
  graph: CompiledStateGraph<any, any, any, any, any, any>,
  outputPath = 'graph.png',
): Promise<void> {
  const drawableGraph = await graph.getGraphAsync();
  const png = await drawableGraph.drawMermaidPng({ backgroundColor: 'white' });

  await writeFile(outputPath, Buffer.from(await png.arrayBuffer()));
  logger.info({ outputPath }, 'graph image saved');
}
