import { blended } from "../../../lib/price";
import { catalog } from "../../../lib/rails";
import { SellDesk } from "./sell-desk";

export const dynamic = "force-dynamic";

export default async function SellPage() {
  const rails = await catalog().catch(() => []);
  const offered = rails
    .filter((rail) => rail.enabled && rail.id !== "near-ai")
    .map((rail) => ({
      id: rail.id,
      models: rail.models
        .map((model) => ({ id: model.canonical, list: blended({ prompt: model.listPrompt, completion: model.listCompletion }).toString() }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }));
  return <SellDesk rails={offered} />;
}
