import { HomeScreen } from "@/components/home/HomeScreen";
import { useSession } from "@/components/SessionProvider";

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
  } = useSession();

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
