import { AppSidebar } from "@/strudel-editor/components/layouts/sidebar-layout/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="strudel-flow-editor-shell flex h-screen w-full flex-col overflow-hidden">
        <SidebarTrigger className="absolute z-10" />
        {children}
      </main>
    </SidebarProvider>
  );
}
