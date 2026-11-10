import { ApprovalBand } from "../components/landing/approval-band";
import { ExpiringCredit } from "../components/landing/expiring-credit";
import { Hero } from "../components/landing/hero";
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
        <div className="mx-auto max-w-[1520px] lg:border-x lg:border-line">
          <Hero />
          <ExpiringCredit />
          <RequestStory />
          <ApprovalBand />
          <IndexStory />
          <Proof />
          <WaysIn />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
