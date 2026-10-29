import { NextResponse, type NextRequest } from "next/server";
import { getSharedFolder, signSharedDocs } from "@/lib/shared-folder";

// Corto: el enlace firmado solo sirve para esta apertura.
const OPEN_URL_TTL = 60;

/**
 * Abre un documento de una carpeta compartida. Se firma en cada clic (en vez
 * de al renderizar la página) para que los enlaces no caduquen aunque la
 * página quede abierta mucho tiempo.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/s/[code]/d/[docId]">,
) {
  const { code, docId } = await ctx.params;
  const share = await getSharedFolder(code);
  const doc = share?.docs.find((d) => d.id === docId);
  if (!doc) {
    return new NextResponse("Este documento ya no está compartido.", {
      status: 404,
    });
  }

  const urls = await signSharedDocs([doc], OPEN_URL_TTL);
  const url = urls.get(doc.id);
  if (!url) {
    return new NextResponse("No se pudo abrir el documento.", { status: 502 });
  }
  return NextResponse.redirect(url);
}
