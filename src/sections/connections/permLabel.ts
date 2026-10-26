import type { useDashboard } from "../../dashboard/DashboardContext";

type Translations = ReturnType<typeof useDashboard>["t"];

export function permLabelFor(t: Translations, perm: string): string {
  return (
    (
      {
        ViewChannel: t.bot.permViewChannel,
        ReadMessageHistory: t.bot.permReadMessageHistory,
        SendMessages: t.bot.permSendMessages,
      } as Record<string, string>
    )[perm] ?? perm
  );
}
