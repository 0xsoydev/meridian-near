import { LiveStrip } from "../../components/live-strip";
import { SiteShell } from "../../components/site-shell";
import { Providers } from "./providers";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="relative flex min-h-screen flex-col bg-white pb-9">
        <SiteShell>
          <LiveStrip />
          {children}
        </SiteShell>
      </div>
    </Providers>
  );
}
