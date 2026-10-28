import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { Organizer } from "./_components/organizer";

export default function Home() {
  // Leer la sesión es un dato del request: con Cache Components tiene que ir
  // detrás de Suspense. El fallback forma parte del shell estático.
  return (
    <Suspense fallback={<div className="h-dvh" aria-busy />}>
      <AuthedOrganizer />
    </Suspense>
  );
}

async function AuthedOrganizer() {
  const user = await getCurrentUser();
  return <Organizer user={user} />;
}
