import { fail } from "../../../../../lib/errors.ts";
import { view } from "../../../../../lib/near.ts";
import { readMarket } from "../../../../../lib/perp.ts";

type PostView = { price: string; at: number };

export async function GET(request: Request): Promise<Response> {
  const model = new URL(request.url).searchParams.get("model");
  if (!model) return fail(400, "invalid_request", "model is required");
  const [market, posts] = await Promise.all([
    readMarket(model),
    view<PostView[]>("posts", { model }),
  ]);
  return Response.json({
    model,
    listed: market.listed,
    price_micro_per_mtok: market.price.toString(),
    updated_at: market.updatedAt.toString(),
    long_oi: market.longOi.toString(),
    short_oi: market.shortOi.toString(),
    funding_rate_per_hour: market.fundingRatePerHour.toString(),
    max_leverage: market.maxLeverage.toString(),
    max_oi: market.maxOi.toString(),
    posts: posts.map((post) => ({ price_micro_per_mtok: post.price, at: post.at })),
  });
}
