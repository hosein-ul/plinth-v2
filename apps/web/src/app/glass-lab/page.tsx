import type { Metadata } from "next";
import { GlassLab } from "./glass-lab";

export const metadata: Metadata = { title: "Glass lab", robots: { index: false, follow: false } };

export default function Page() {
  return <GlassLab />;
}
