import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import AppNav from "@/components/AppNav";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import OfflineSync from "@/components/OfflineSync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Cookie exists (proxy let them through) but the JWT is invalid — clear it.
  if (!user) redirect("/api/auth/logout");

  return (
    <div className="min-h-dvh md:flex">
      <ServiceWorkerRegistrar />
      <OfflineSync />
      <AppNav userName={user.name} userPhotoUrl={user.photoUrl} />
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-20 md:px-10 md:pb-12 md:pt-10">
          {children}
        </main>
      </div>
    </div>
  );
}
