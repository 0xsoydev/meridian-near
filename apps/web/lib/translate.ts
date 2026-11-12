import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CLAUDE_PREAMBLE } from "./oauth.ts";

export type ChatBody = {
  messages: unknown[];
  stream?: boolean | undefined;
  tools?: unknown;
  tool_choice?: unknown;
  temperature?: unknown;
  top_p?: unknown;
  stop?: unknown;
};

type Usage = { prompt_tokens: number; completion_tokens: number };

const chatMessageSchema = z
  .object({
    role: z.enum(["system", "developer", "user", "assistant", "tool"]),
    content: z.unknown().optional(),
    tool_calls: z
      .array(z.object({ id: z.string(), function: z.object({ name: z.string(), arguments: z.string() }) }))
      .optional(),
    tool_call_id: z.string().optional(),
  })
  .passthrough();

const chatToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.unknown().optional(),
  }),
});

const anthropicEventSchema = z
  .object({
    type: z.string(),
    index: z.number().optional(),
    message: z
      .object({
        id: z.string().optional(),
        usage: z
          .object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    content_block: z
      .object({ type: z.string().optional(), id: z.string().optional(), name: z.string().optional() })
      .passthrough()
      .optional(),
    delta: z
      .object({
        type: z.string().optional(),
        text: z.string().optional(),
        partial_json: z.string().optional(),
        stop_reason: z.string().nullish(),
      })
      .passthrough()
      .optional(),
    usage: z.object({ output_tokens: z.number().optional() }).passthrough().optional(),
    error: z.object({ message: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

const anthropicReplySchema = z
  .object({
    id: z.string().optional(),
    content: z.array(
      z
        .object({
          type: z.string(),
          text: z.string().optional(),
          id: z.string().optional(),
          name: z.string().optional(),
          input: z.unknown().optional(),
        })
        .passthrough(),
    ),
    stop_reason: z.string().nullish(),
    usage: z
      .object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const codexEventSchema = z
  .object({
    type: z.string(),
    delta: z.string().optional(),
    text: z.string().optional(),
    arguments: z.string().optional(),
    item_id: z.string().optional(),
    item: z
      .object({
        type: z.string().optional(),
        id: z.string().optional(),
        name: z.string().optional(),
        call_id: z.string().optional(),
        arguments: z.string().optional(),
      })
      .passthrough()
      .optional(),
    response: z
      .object({
        id: z.string().optional(),
        usage: z
          .object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
          .passthrough()
          .nullish(),
        error: z.object({ message: z.string().optional() }).passthrough().nullish(),
        incomplete_details: z.object({ reason: z.string().optional() }).passthrough().nullish(),
      })
      .passthrough()
      .optional(),
    error: z.object({ message: z.string().optional() }).passthrough().nullish(),
    message: z.string().optional(),
  })
  .passthrough();

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part !== null && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
          return (part as Record<string, string>).text;
        }
        return "";
      })
      .join("");
  }
  if (content === null || content === undefined) return "";
  return JSON.stringify(content);
}

function responsesToolChoice(choice: unknown): unknown {
  if (choice === "auto" || choice === "none" || choice === "required") return choice;
  const named = z.object({ function: z.object({ name: z.string() }) }).passthrough().safeParse(choice);
  return named.success ? { type: "function", name: named.data.function.name } : undefined;
}

export function responsesBody(body: ChatBody, upstream: string, maxTokens: number): Record<string, unknown> {
  const instructions: string[] = [];
  const input: Record<string, unknown>[] = [];
  for (const raw of body.messages) {
    const parsed = chatMessageSchema.safeParse(raw);
    if (!parsed.success) continue;
    const message = parsed.data;
    const text = textOf(message.content);
    if (message.role === "system" || message.role === "developer") {
      if (text) instructions.push(text);
      continue;
    }
    if (message.role === "tool") {
      input.push({ type: "function_call_output", call_id: message.tool_call_id ?? "", output: text });
      continue;
    }
    if (message.role === "assistant") {
      if (text) input.push({ role: "assistant", content: [{ type: "output_text", text }] });
      for (const call of message.tool_calls ?? []) {
        input.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments });
      }
      continue;
    }
    input.push({ role: "user", content: [{ type: "input_text", text }] });
  }
  const tools = (Array.isArray(body.tools) ? body.tools : []).flatMap((tool) => {
    const parsed = chatToolSchema.safeParse(tool);
    return parsed.success ? [parsed.data] : [];
  });
  const toolChoice = responsesToolChoice(body.tool_choice);
  return {
    model: upstream,
    ...(instructions.length > 0 ? { instructions: instructions.join("\n\n") } : {}),
    input,
    stream: true,
    store: false,
    max_output_tokens: maxTokens,
    ...(tools.length > 0
      ? {
          tools: tools.map((tool) => ({
            type: "function",
            name: tool.function.name,
            description: tool.function.description ?? "",
            parameters: tool.function.parameters ?? { type: "object", properties: {} },
            strict: false,
          })),
        }
      : {}),
    ...(toolChoice === undefined ? {} : { tool_choice: toolChoice }),
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function anthropicToolChoice(choice: unknown): Record<string, unknown> | null {
  if (choice === "auto" || choice === undefined) return { type: "auto" };
  if (choice === "required") return { type: "any" };
  if (choice === "none") return null;
  const named = z.object({ function: z.object({ name: z.string() }) }).passthrough().safeParse(choice);
  return named.success ? { type: "tool", name: named.data.function.name } : { type: "auto" };
}

export function anthropicBody(body: ChatBody, upstream: string, maxTokens: number): Record<string, unknown> {
  const system: string[] = [CLAUDE_PREAMBLE];
  const messages: Record<string, unknown>[] = [];
  for (const raw of body.messages) {
    const parsed = chatMessageSchema.safeParse(raw);
    if (!parsed.success) continue;
    const message = parsed.data;
    const text = textOf(message.content);
    if (message.role === "system" || message.role === "developer") {
      if (text) system.push(text);
      continue;
    }
    if (message.role === "tool") {
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: message.tool_call_id ?? "", content: text }],
      });
      continue;
    }
    if (message.role === "assistant") {
      const content: Record<string, unknown>[] = [];
      if (text) content.push({ type: "text", text });
      for (const call of message.tool_calls ?? []) {
        content.push({ type: "tool_use", id: call.id, name: call.function.name, input: parseJson(call.function.arguments) });
      }
      if (content.length > 0) messages.push({ role: "assistant", content });
      continue;
    }
    messages.push({ role: "user", content: [{ type: "text", text }] });
  }

  const tools = (Array.isArray(body.tools) ? body.tools : []).flatMap((tool) => {
    const parsed = chatToolSchema.safeParse(tool);
    return parsed.success ? [parsed.data] : [];
  });
  const choice = anthropicToolChoice(body.tool_choice);
  const stop = body.stop;
  return {
    model: upstream,
    max_tokens: maxTokens,
    system: system.join("\n\n"),
    messages,
    stream: body.stream === true,
    ...(tools.length > 0 && choice
      ? {
          tools: tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description ?? "",
            input_schema: tool.function.parameters ?? { type: "object", properties: {} },
          })),
          tool_choice: choice,
        }
      : {}),
    ...(typeof body.temperature === "number" ? { temperature: body.temperature } : {}),
    ...(typeof body.top_p === "number" ? { top_p: body.top_p } : {}),
    ...(Array.isArray(stop)
      ? { stop_sequences: stop.filter((value): value is string => typeof value === "string") }
      : typeof stop === "string"
        ? { stop_sequences: [stop] }
        : {}),
  };
}

type CodexTool = { key: string; id: string; name: string; arguments: string };

type CodexState = {
  id: string;
  created: number;
  text: string;
  usage: Usage | null;
  tools: CodexTool[];
  failed: string | null;
};

function codexState(): CodexState {
  return {
    id: `chatcmpl-${randomUUID()}`,
    created: Math.floor(Date.now() / 1000),
    text: "",
    usage: null,
    tools: [],
    failed: null,
  };
}

function chunk(
  state: { id: string; created: number },
  model: string,
  delta: Record<string, unknown>,
  finish: "stop" | "tool_calls" | "length" | null,
): Record<string, unknown> {
  return {
    id: state.id,
    object: "chat.completion.chunk",
    created: state.created,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function counted(usage: Usage | null): Usage | null {
  return usage && (usage.prompt_tokens > 0 || usage.completion_tokens > 0) ? usage : null;
}

function usageChunk(
  state: { id: string; created: number },
  model: string,
  usage: Usage | null,
): string[] {
  const known = counted(usage);
  if (!known) return [];
  return [
    sse({
      id: state.id,
      object: "chat.completion.chunk",
      created: state.created,
      model,
      choices: [],
      usage: known,
    }),
  ];
}

function codexEvent(event: z.infer<typeof codexEventSchema>, state: CodexState, model: string): string[] {
  switch (event.type) {
    case "response.created":
      if (event.response?.id) state.id = event.response.id;
      return [sse(chunk(state, model, { role: "assistant" }, null))];
    case "response.output_text.delta":
      if (!event.delta) return [];
      state.text += event.delta;
      return [sse(chunk(state, model, { content: event.delta }, null))];
    case "response.output_item.added": {
      if (event.item?.type !== "function_call") return [];
      const tool: CodexTool = {
        key: event.item.id ?? event.item.call_id ?? `call_${state.tools.length}`,
        id: event.item.call_id ?? event.item.id ?? `call_${state.tools.length}`,
        name: event.item.name ?? "",
        arguments: "",
      };
      state.tools.push(tool);
      return [
        sse(
          chunk(
            state,
            model,
            {
              tool_calls: [
                { index: state.tools.length - 1, id: tool.id, type: "function", function: { name: tool.name, arguments: "" } },
              ],
            },
            null,
          ),
        ),
      ];
    }
    case "response.function_call_arguments.delta": {
      const index = event.item_id ? state.tools.findIndex((tool) => tool.key === event.item_id) : state.tools.length - 1;
      const tool = state.tools[index];
      if (!tool || !event.delta) return [];
      tool.arguments += event.delta;
      return [sse(chunk(state, model, { tool_calls: [{ index, function: { arguments: event.delta } }] }, null))];
    }
    case "response.completed":
      state.usage = {
        prompt_tokens: event.response?.usage?.input_tokens ?? 0,
        completion_tokens: event.response?.usage?.output_tokens ?? 0,
      };
      if (event.response?.id) state.id = event.response.id;
      return [
        sse(chunk(state, model, {}, state.tools.length > 0 ? "tool_calls" : "stop")),
        ...usageChunk(state, model, state.usage),
      ];
    case "response.incomplete":
      state.usage = {
        prompt_tokens: event.response?.usage?.input_tokens ?? 0,
        completion_tokens: event.response?.usage?.output_tokens ?? 0,
      };
      if (event.response?.id) state.id = event.response.id;
      return [sse(chunk(state, model, {}, "length")), ...usageChunk(state, model, state.usage)];
    case "response.output_text.done":
      if (state.text || !event.text) return [];
      state.text = event.text;
      return [sse(chunk(state, model, { content: event.text }, null))];
    case "response.function_call_arguments.done": {
      const index = event.item_id ? state.tools.findIndex((tool) => tool.key === event.item_id) : state.tools.length - 1;
      const tool = state.tools[index];
      if (!tool || tool.arguments || !event.arguments) return [];
      tool.arguments = event.arguments;
      return [sse(chunk(state, model, { tool_calls: [{ index, function: { arguments: event.arguments } }] }, null))];
    }
    case "response.output_item.done": {
      const item = event.item;
      if (item?.type !== "function_call") return [];
      const index = item.id ? state.tools.findIndex((tool) => tool.key === item.id) : state.tools.length - 1;
      const tool = state.tools[index];
      if (!tool || tool.arguments || !item.arguments) return [];
      tool.arguments = item.arguments;
      return [sse(chunk(state, model, { tool_calls: [{ index, function: { arguments: item.arguments } }] }, null))];
    }
    case "response.failed":
      state.failed = event.response?.error?.message ?? "the account's model call failed";
      return [];
    case "error":
      state.failed = event.error?.message ?? event.message ?? "the account's model call failed";
      return [];
    default:
      return [];
  }
}

function pump(
  source: ReadableStream<Uint8Array>,
  state: { failed: string | null },
  handle: (json: unknown) => string[],
): Response {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (state.failed) {
            controller.error(new Error(state.failed));
            return;
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          for (const line of frame.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            let json: unknown;
            try {
              json = JSON.parse(data);
            } catch {
              continue;
            }
            for (const out of handle(json)) controller.enqueue(encoder.encode(out));
          }
        }
        if (state.failed) controller.error(new Error(state.failed));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await reader.cancel();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

function streamCodex(source: ReadableStream<Uint8Array>, model: string): Response {
  const state = codexState();
  return pump(source, state, (json) => {
    const parsed = codexEventSchema.safeParse(json);
    return parsed.success ? codexEvent(parsed.data, state, model) : [];
  });
}

async function bufferCodex(source: ReadableStream<Uint8Array>, model: string): Promise<Response> {
  const text = await new Response(source).text();
  const state = codexState();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }
    const parsed = codexEventSchema.safeParse(json);
    if (parsed.success) codexEvent(parsed.data, state, model);
  }
  if (state.failed) return Response.json({ error: { message: state.failed } }, { status: 502 });

  const message: Record<string, unknown> = { role: "assistant", content: state.text || null };
  if (state.tools.length > 0) {
    message.tool_calls = state.tools.map((tool) => ({
      id: tool.id,
      type: "function",
      function: { name: tool.name, arguments: tool.arguments },
    }));
  }
  const usage = counted(state.usage);
  return Response.json({
    id: state.id,
    object: "chat.completion",
    created: state.created,
    model,
    choices: [{ index: 0, message, finish_reason: state.tools.length > 0 ? "tool_calls" : "stop" }],
    ...(usage ? { usage } : {}),
  });
}

export function translateCodex(response: Response, model: string, stream: boolean): Response | Promise<Response> {
  if (!response.body) return response;
  return stream ? streamCodex(response.body, model) : bufferCodex(response.body, model);
}

type AnthropicTool = { id: string; name: string; arguments: string; index: number };

type AnthropicState = {
  id: string;
  created: number;
  usage: Usage;
  tools: Map<number, AnthropicTool>;
  stop: string | null;
  failed: string | null;
};

function finishOf(stop: string | null, tools: boolean): "stop" | "tool_calls" | "length" {
  if (stop === "tool_use") return "tool_calls";
  if (stop === "max_tokens") return "length";
  return tools ? "tool_calls" : "stop";
}

function anthropicEvent(event: z.infer<typeof anthropicEventSchema>, state: AnthropicState, model: string): string[] {
  switch (event.type) {
    case "message_start":
      if (event.message?.id) state.id = event.message.id;
      state.usage.prompt_tokens = event.message?.usage?.input_tokens ?? 0;
      return [sse(chunk(state, model, { role: "assistant" }, null))];
    case "content_block_start": {
      const block = event.content_block;
      if (block?.type !== "tool_use" || event.index === undefined) return [];
      const tool: AnthropicTool = {
        id: block.id ?? `toolu_${event.index}`,
        name: block.name ?? "",
        arguments: "",
        index: state.tools.size,
      };
      state.tools.set(event.index, tool);
      return [
        sse(
          chunk(
            state,
            model,
            {
              tool_calls: [
                { index: tool.index, id: tool.id, type: "function", function: { name: tool.name, arguments: "" } },
              ],
            },
            null,
          ),
        ),
      ];
    }
    case "content_block_delta": {
      const delta = event.delta;
      if (delta?.type === "input_json_delta" && event.index !== undefined) {
        const tool = state.tools.get(event.index);
        if (!tool || !delta.partial_json) return [];
        tool.arguments += delta.partial_json;
        return [sse(chunk(state, model, { tool_calls: [{ index: tool.index, function: { arguments: delta.partial_json } }] }, null))];
      }
      if (delta?.type === "text_delta" && delta.text) {
        return [sse(chunk(state, model, { content: delta.text }, null))];
      }
      return [];
    }
    case "message_delta":
      if (event.delta?.stop_reason) state.stop = event.delta.stop_reason;
      if (event.usage?.output_tokens !== undefined) state.usage.completion_tokens = event.usage.output_tokens;
      return [];
    case "message_stop":
      return [
        sse(chunk(state, model, {}, finishOf(state.stop, state.tools.size > 0))),
        ...usageChunk(state, model, state.usage),
      ];
    case "error":
      state.failed = event.error?.message ?? "the account's model call failed";
      return [];
    default:
      return [];
  }
}

function streamAnthropic(source: ReadableStream<Uint8Array>, model: string): Response {
  const state: AnthropicState = {
    id: `chatcmpl-${randomUUID()}`,
    created: Math.floor(Date.now() / 1000),
    usage: { prompt_tokens: 0, completion_tokens: 0 },
    tools: new Map(),
    stop: null,
    failed: null,
  };
  return pump(source, state, (json) => {
    const parsed = anthropicEventSchema.safeParse(json);
    return parsed.success ? anthropicEvent(parsed.data, state, model) : [];
  });
}

async function bufferAnthropic(response: Response, model: string): Promise<Response> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = anthropicReplySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: { message: "the upstream sent an unreadable answer" } }, { status: 502 });
  }
  const text = parsed.data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  const calls = parsed.data.content
    .filter((block) => block.type === "tool_use")
    .map((block) => ({
      id: block.id ?? "",
      type: "function",
      function: { name: block.name ?? "", arguments: JSON.stringify(block.input ?? {}) },
    }));
  const usage = counted({
    prompt_tokens: parsed.data.usage?.input_tokens ?? 0,
    completion_tokens: parsed.data.usage?.output_tokens ?? 0,
  });
  return Response.json({
    id: parsed.data.id ?? `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          ...(calls.length > 0 ? { tool_calls: calls } : {}),
        },
        finish_reason: finishOf(parsed.data.stop_reason ?? null, calls.length > 0),
      },
    ],
    ...(usage ? { usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens } } : {}),
  });
}

export function translateAnthropic(response: Response, model: string, stream: boolean): Response | Promise<Response> {
  if (!response.body) return response;
  return stream ? streamAnthropic(response.body, model) : bufferAnthropic(response, model);
}
