import { eq } from "drizzle-orm";
import { z } from "zod";
import { routerKey } from "../../../../../lib/auth.ts";
import { db } from "../../../../../lib/db.ts";
import { fail } from "../../../../../lib/errors.ts";
import { keys } from "../../../../../lib/schema.ts";

const schema = z
  .object({ default_model: z.string().min(1).max(200).nullable().optional() })
  .strict();

export async function PATCH(request: Request): Promise<Response> {
  const key = await routerKey(request);
  if (!key) return fail(401, "invalid_api_key", "invalid router key");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "invalid settings");
  if (parsed.data.default_model === undefined) return fail(400, "invalid_request", "nothing to change");
  await db()
    .update(keys)
    .set({ defaultModel: parsed.data.default_model ?? null })
    .where(eq(keys.id, key.id));
  return Response.json({ default_model: parsed.data.default_model ?? null });
}
