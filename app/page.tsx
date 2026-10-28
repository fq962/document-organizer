import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizerData } from "@/lib/organizer-data";
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
  // La sesión y los datos son de cada usuario: no se pueden prerenderizar.
  // Además Supabase compara la expiración del token con la hora actual, y
  // eso solo se permite una vez que el render ocurre por request.
  await connection();
  const user = await getCurrentUser();
  const data = await getOrganizerData();
  return <Organizer user={user} data={data} />;
}
