import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GitHub → Supabase → aquí, con un `code` de un solo uso que se cambia por la
 * sesión (flujo PKCE). Las cookies de sesión quedan escritas en la respuesta.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Solo rutas internas, para no convertir esto en un open redirect.
  const nextParam = searchParams.get("next") ?? "/";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  // El usuario canceló en GitHub, el code expiró, o la URL no es válida.
  return NextResponse.redirect(new URL("/login?error=callback", origin));
}
