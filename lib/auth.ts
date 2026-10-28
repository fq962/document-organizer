import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

/**
 * Usuario de la sesión actual, validado contra el servidor de Supabase.
 * Devuelve solo lo que la UI necesita. Si no hay sesión, redirige a /login.
 * `cache` evita repetir la consulta dentro del mismo render.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  const { user } = data;
  const meta = user.user_metadata as Record<string, string | undefined>;
  return {
    id: user.id,
    name:
      meta.full_name || meta.name || meta.user_name || user.email || "Usuario",
    username: meta.user_name ?? null,
    avatarUrl: meta.avatar_url ?? null,
  };
});
