import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "./env";
import { DB_SCHEMA } from "./schema";

/**
 * Cliente de Supabase para el navegador. Usa la sesión de las cookies y las
 * políticas RLS garantizan que cada usuario solo toque sus propios datos.
 * `createBrowserClient` ya devuelve una única instancia por pestaña.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseKey(), {
    db: { schema: DB_SCHEMA },
  });
}
