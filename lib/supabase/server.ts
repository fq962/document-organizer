import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseKey, supabaseUrl } from "./env";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route
 * Handlers. Crear uno nuevo por request: nunca compartirlo entre requests.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseKey(), {
    // Las tablas de la app viven en este esquema, no en `public`.
    db: { schema: "document_organizer" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Los Server Components no pueden escribir cookies. No pasa nada:
          // el proxy ya refresca la sesión antes de cada render.
        }
      },
    },
  });
}
