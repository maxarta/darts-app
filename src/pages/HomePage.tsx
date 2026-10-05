import { HomeScreen } from "@/components/home/HomeScreen";
import { useTelegram } from "@/components/TelegramProvider";

export function HomePage() {
  const {
    ready,
    error,
    channel,
    isChannelAdmin,
    appMode,
    refreshSession,
    unlockExtended,
    switchToGuest,
  } = useTelegram();

  return (
    <HomeScreen
      channelId={channel?.id ?? null}
      loading={!ready}
      error={error}
      isChannelAdmin={isChannelAdmin}
      appMode={appMode}
      onRetry={() => void refreshSession()}
      onUnlockExtended={unlockExtended}
      onSwitchToGuest={switchToGuest}
    />
  );
}
