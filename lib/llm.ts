import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY, PRICES } from "./config";

/** One place for every model call, so swapping to a BAA-covered host (e.g. Bedrock) is a config change. */

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY in .env");
  client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 4 });
  return client;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function newUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

export type ContentBlock = Anthropic.Messages.ContentBlockParam;

/**
 * Ask the model for structured output by forcing a single tool call whose input
 * must match `schema`. Returns the tool input.
 */
export async function callStructured<T>(opts: {
  model: string;
  system: string;
  content: ContentBlock[];
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  usage: Usage;
}): Promise<T> {
  const res = await getClient().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.schema as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [{ role: "user", content: opts.content }],
  });
  const [pin, pout] = PRICES[opts.model] ?? [3, 15];
  opts.usage.inputTokens += res.usage.input_tokens;
  opts.usage.outputTokens += res.usage.output_tokens;
  opts.usage.costUsd += (res.usage.input_tokens * pin + res.usage.output_tokens * pout) / 1_000_000;

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error(`Model returned no ${opts.toolName} output`);
  return block.input as T;
}
