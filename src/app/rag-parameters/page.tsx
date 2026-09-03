"use client";

import { AppShell } from "@/components/layout/AppShell";
import { PageRenderer } from "@/components/layout/PageRenderer";

export default function RagParametersRoute() {
  return (
    <AppShell>
      {({ activePage, setActivePage }) => (
        <PageRenderer activePage={activePage} setActivePage={setActivePage} />
      )}
    </AppShell>
  );
}
