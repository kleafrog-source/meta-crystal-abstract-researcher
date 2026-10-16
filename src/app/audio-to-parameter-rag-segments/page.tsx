"use client";

import dynamic from "next/dynamic";

import { AppShell } from "@/components/layout/AppShell";

const AudioToParameterPage = dynamic(
  () =>
    import("@/components/pages/AudioToParameterPage").then(
      (module) => module.AudioToParameterPage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Загрузка аудиоредактора…
      </div>
    ),
  },
);

export default function AudioToParameterSegmentsRoute() {
  return (
    <AppShell>
      {() => <AudioToParameterPage />}
    </AppShell>
  );
}
