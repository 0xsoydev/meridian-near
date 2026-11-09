import { LiveStrip } from "../../components/live-strip";
import { SiteShell } from "../../components/site-shell";
import { Providers } from "./providers";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="relative flex min-h-screen flex-col bg-white pb-9">
        <SiteShell>
          <div id="status-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-4 lg:px-6">
            <LiveStrip />
          </div>
          {children}
        </SiteShell>
      </div>
    </Providers>
  );
}
