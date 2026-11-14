import { AgentsTerminal } from "../components/landing/agents-terminal";
import { Capacity } from "../components/landing/capacity";
import { LandingHeader } from "../components/landing/header";
import { Hedge } from "../components/landing/hedge";
import { Hero } from "../components/landing/hero";
import { Limit } from "../components/landing/limit";
import { Proof } from "../components/landing/proof";
import { RequestStory } from "../components/landing/request-story";
import { SiteFooter } from "../components/landing/site-footer";
import { Story } from "../components/landing/story";
import { WaysIn } from "../components/landing/ways-in";

const HOST = (process.env.PUBLIC_HOST ?? "http://localhost:3000").replace(/\/+$/, "");

export default function Home() {
  return (
    <div className="mx-auto max-w-[1440px] bg-white [--color-muted:#6f6f6f] min-[1441px]:border-x min-[1441px]:border-line">
      <LandingHeader />
      <main>
        <Hero />
        <Story />
        <Capacity />
        <RequestStory />
        <Limit />
        <Hedge />
        <Proof />
        <AgentsTerminal variant="section" host={HOST} />
        <WaysIn />
      </main>
      <SiteFooter />
    </div>
  );
}
