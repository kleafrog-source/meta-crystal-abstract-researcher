"use client";

import { AppShell } from "@/components/layout/AppShell";
import { PageRenderer } from "@/components/layout/PageRenderer";

export default function MetaCrystalV3LabRoute() {
  return <AppShell>{({ activePage, setActivePage }) => <PageRenderer activePage={activePage} setActivePage={setActivePage} />}</AppShell>;
}

