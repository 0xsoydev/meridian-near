import { Providers } from "../(site)/providers";

export default function ApproveLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
