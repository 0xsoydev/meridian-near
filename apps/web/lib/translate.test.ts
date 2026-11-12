import assert from "node:assert/strict";
import test from "node:test";
import { CLAUDE_PREAMBLE } from "./oauth.ts";
import { anthropicBody, responsesBody, translateAnthropic, translateCodex } from "./translate.ts";

const tools = [
  { type: "function", function: { name: "lookup", description: "d", parameters: { type: "object", properties: {} } } },
];

test("a chat turns into an Anthropic request with the CLI preamble and tools", () => {
  const body = anthropicBody(
    {
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hi" },
        { role: "assistant", content: null, tool_calls: [{ id: "call_1", function: { name: "lookup", arguments: '{"q":"x"}' } }] },
        { role: "tool", tool_call_id: "call_1", content: "42" },
      ],
      tools,
      tool_choice: "auto",
      stream: false,
    },
    "claude-sonnet-5-5",
    128,
  );
  assert.equal(body.system, `${CLAUDE_PREAMBLE}\n\nbe terse`);
  assert.equal(body.max_tokens, 128);
  assert.equal(body.stream, false);
  const messages = body.messages as unknown[];
  assert.deepEqual(messages[0], { role: "user", content: [{ type: "text", text: "hi" }] });
  assert.deepEqual(messages[1], {
    role: "assistant",
    content: [{ type: "tool_use", id: "call_1", name: "lookup", input: { q: "x" } }],
  });
  assert.deepEqual(messages[2], {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "call_1", content: "42" }],
  });
  assert.deepEqual(body.tools, [{ name: "lookup", description: "d", input_schema: { type: "object", properties: {} } }]);
});

test("a chat turns into a Responses request that always streams and stores nothing", () => {
  const body = responsesBody(
    {
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "lookup" } },
    },
    "gpt-6-sol",
    64,
  );
  assert.equal(body.instructions, "sys");
  assert.equal(body.stream, true);
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 64);
  assert.deepEqual(body.input, [{ role: "user", content: [{ type: "input_text", text: "hi" }] }]);
  assert.deepEqual(body.tool_choice, { type: "function", name: "lookup" });
});

test("an Anthropic answer becomes an OpenAI completion", async () => {
  const upstream = Response.json({
    id: "msg_1",
    content: [{ type: "text", text: "hello" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 3, output_tokens: 2 },
  });
  const translated = (await translateAnthropic(upstream, "claude-sonnet-5-5", false)) as Response;
  const payload = (await translated.json()) as {
    choices: { message: { content: string }; finish_reason: string }[];
    usage: unknown;
  };
  assert.equal(payload.choices[0]?.message.content, "hello");
  assert.equal(payload.choices[0]?.finish_reason, "stop");
  assert.deepEqual(payload.usage, { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
});

test("an Anthropic stream becomes OpenAI chunks with usage", async () => {
  const text = [
    'data: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":5,"output_tokens":0}}}',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}',
    'data: {"type":"message_stop"}',
    "",
    "",
  ].join("\n");
  const translated = (await translateAnthropic(new Response(text), "claude-sonnet-5-5", true)) as Response;
  const output = await translated.text();
  assert.ok(output.includes('"content":"hi"'));
  assert.ok(output.includes('"prompt_tokens":5'));
  assert.ok(output.includes('"completion_tokens":2'));
  assert.ok(output.includes('"finish_reason":"stop"'));
});

test("a Codex stream becomes OpenAI chunks with usage and a done marker", async () => {
  const text = [
    'data: {"type":"response.created","response":{"id":"resp_1"}}',
    'data: {"type":"response.output_text.delta","delta":"hi"}',
    'data: {"type":"response.completed","response":{"id":"resp_1","usage":{"input_tokens":4,"output_tokens":1}}}',
    "",
    "",
  ].join("\n");
  const translated = (await translateCodex(new Response(text), "gpt-6-sol", true)) as Response;
  const output = await translated.text();
  assert.ok(output.includes('"content":"hi"'));
  assert.ok(output.includes('"prompt_tokens":4'));
  assert.ok(output.includes('"finish_reason":"stop"'));
  assert.ok(output.trimEnd().endsWith("data: [DONE]"));
});

test("a Codex completion without usage leaves the charge to the router", async () => {
  const text = ['data: {"type":"response.completed","response":{"id":"resp_1"}}', "", ""].join("\n");
  const translated = (await translateCodex(new Response(text), "gpt-6-sol", true)) as Response;
  const output = await translated.text();
  assert.ok(!output.includes('"usage"'));
  assert.ok(output.includes('"finish_reason":"stop"'));
});

test("a Codex incomplete response finishes as length", async () => {
  const text = [
    'data: {"type":"response.incomplete","response":{"id":"resp_1","usage":{"input_tokens":4,"output_tokens":2}}}',
    "",
    "",
  ].join("\n");
  const translated = (await translateCodex(new Response(text), "gpt-6-sol", true)) as Response;
  const output = await translated.text();
  assert.ok(output.includes('"finish_reason":"length"'));
  assert.ok(output.includes('"completion_tokens":2'));
});

test("a Codex tool call becomes an OpenAI tool call", async () => {
  const text = [
    'data: {"type":"response.output_item.added","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"lookup"}}',
    'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","delta":"{\\"q\\":\\"x\\"}"}',
    'data: {"type":"response.completed","response":{"id":"resp_1","usage":{"input_tokens":4,"output_tokens":2}}}',
    "",
    "",
  ].join("\n");
  const translated = (await translateCodex(new Response(text), "gpt-6-sol", true)) as Response;
  const output = await translated.text();
  assert.ok(output.includes('"id":"call_1"'));
  assert.ok(output.includes('"name":"lookup"'));
  assert.ok(output.includes('"finish_reason":"tool_calls"'));
});
