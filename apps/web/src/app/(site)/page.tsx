import { WEBHOOK_EVENT_TYPES } from "@plinth/shared";
import { ChatHero } from "@/components/chat/chat-hero";
import { ChatAudience, ChatClosing, ChatGap } from "@/components/chat/chat-market";
import { ChatHow, ChatWho } from "@/components/chat/chat-sections";
import { ChatPaths } from "@/components/chat/chat-paths";
import { AiNative } from "@/components/marketing/ai-native";
import { AssetsNetworks } from "@/components/marketing/assets-networks";
import { BuiltOn } from "@/components/marketing/built-on";
import { IrisReveal } from "@/components/marketing/motion/iris-reveal";
import { Statement } from "@/components/marketing/statement";
import { NonCustodial } from "@/components/marketing/non-custodial";
import { TwoFlows } from "@/components/marketing/two-flows";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { DevSection } from "@/components/marketing/dev-section";
import { Faq } from "@/components/marketing/faq";

/**
 * One landing for the whole product, led by the audience it is built for. Order: who and why (hero, audience, thesis, sellers),
 * how a payment goes from tap to delivered, the two ways to take money, what it is built on (Circle, Arc, Web3Auth), the proof that
 * Plinth never holds it, the two ways a customer pays, the product itself, the networks, the builder's view, the AI-agent side,
 * questions, and the call to start.
 */
export default function Home() {
  return (
    <div className="overflow-x-clip">
      <ChatHero />
      <ChatAudience />
      <ChatGap />
      <IrisReveal><Statement /></IrisReveal>
      <ChatWho />
      <ChatHow />
      <ChatPaths />
      <BuiltOn />
      <NonCustodial />
      <TwoFlows />
      <DashboardPreview />
      <AssetsNetworks />
      <DevSection events={[...WEBHOOK_EVENT_TYPES]} />
      <AiNative />
      <Faq />
      <ChatClosing />
    </div>
  );
}
