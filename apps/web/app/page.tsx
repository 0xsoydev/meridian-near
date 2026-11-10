import { AgentsTerminal } from "../components/landing/agents-terminal";
import { LandingHeader } from "../components/landing/header";
import { Hedge } from "../components/landing/hedge";
import { Hero } from "../components/landing/hero";
import { Limit } from "../components/landing/limit";
import { Markets } from "../components/landing/markets";
import { Proof } from "../components/landing/proof";
import { SiteFooter } from "../components/landing/site-footer";
import { Story } from "../components/landing/story";

const HOST = (process.env.PUBLIC_HOST ?? "http://localhost:3000").replace(/\/+$/, "");

export default function Home() {
  return (
    <div className="mx-auto max-w-[1440px] bg-white min-[1441px]:border-x min-[1441px]:border-line">
      <LandingHeader />
      <main>
        <Hero />
        <Story />
        <Markets />
        <Limit />
        <Hedge />
        <Proof />
        <AgentsTerminal variant="section" host={HOST} />
      </main>
      <SiteFooter />
    </div>
  );
}
