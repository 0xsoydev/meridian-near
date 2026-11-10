import { ApprovalBand } from "../components/landing/approval-band";
import { Frame } from "../components/landing/frame";
import { Hero } from "../components/landing/hero";
import { IdleCapacity } from "../components/landing/idle-capacity";
import { IndexStory } from "../components/landing/index-story";
import { Proof } from "../components/landing/proof";
import { RequestStory } from "../components/landing/request-story";
import { SiteFooter } from "../components/landing/site-footer";
import { WaysIn } from "../components/landing/ways-in";
import { LandingNav } from "../components/site-nav";

export default function Home() {
  return (
    <>
      <LandingNav />
      <main className="lg:px-12">
        <Frame>
          <Hero />
          <IdleCapacity />
          <RequestStory />
          <ApprovalBand />
          <IndexStory />
          <Proof />
          <WaysIn />
        </Frame>
      </main>
      <SiteFooter />
    </>
  );
}
