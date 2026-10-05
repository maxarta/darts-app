import { HomeScreen } from "@/components/home/HomeScreen";
import { useTelegram } from "@/components/TelegramProvider";

export function HomePage() {
  const { ready, error, channel, isChannelAdmin, refreshSession } =
    useTelegram();

  return (
    <HomeScreen
      channelId={channel?.id ?? null}
      loading={!ready}
      error={error}
      isChannelAdmin={isChannelAdmin}
      onRetry={() => void refreshSession()}
    />
  );
}
