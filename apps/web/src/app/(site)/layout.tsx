import { ScrollProgress } from "@/components/marketing/motion/scroll-progress";
import { SiteShell } from "@/components/marketing/chrome";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell><ScrollProgress />{children}</SiteShell>;
}
