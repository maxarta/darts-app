import { Suspense } from "react";
import { TvScreen } from "@/components/tv/TvScreen";

export function TvPage() {
  return (
    <Suspense>
      <TvScreen />
    </Suspense>
  );
}
