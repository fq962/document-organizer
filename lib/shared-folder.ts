import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  STORAGE_BUCKET,
  type SharedFolderPayload,
} from "@/lib/supabase/schema";
import { docFromRow } from "@/lib/organizer-data";
import { SHARE_CODE_PATTERN, type Doc } from "@/app/_components/types";

export type SharedFolderTree = {
  rootId: string;
  ownerName: string | null;
  folders: { id: string; parentId: string | null; name: string; hue: number }[];
  docs: Doc[];
};

/**
 * Carpeta compartida con el código del enlace, o null si no existe o se dejó
 * de compartir. Funciona sin sesión: la RPC es `security definer` y solo
 * devuelve el subárbol compartido.
 */
export const getSharedFolder = cache(
  async (code: string): Promise<SharedFolderTree | null> => {
    // Evita ir a la base con cualquier cosa que llegue en la URL.
    if (!SHARE_CODE_PATTERN.test(code)) return null;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_shared_folder", {
      p_code: code,
    });
    if (error) {
      const { code: errorCode, message, hint } = error;
      console.error("No se pudo cargar la carpeta compartida:", {
        code: errorCode,
        message,
        hint,
      });
      throw new Error(`No se pudo cargar la carpeta compartida: ${message}`);
    }
    if (!data) return null;

    const payload = data as SharedFolderPayload;
    return {
      rootId: payload.root_id,
      ownerName: payload.owner_name,
      folders: payload.folders.map((f) => ({
        id: f.id,
        parentId: f.parent_id,
        name: f.name,
        hue: f.hue,
      })),
      docs: payload.documents.map(docFromRow),
    };
  },
);

/**
 * Enlaces firmados para documentos de una carpeta compartida. La política de
 * Storage "ver archivos compartidos" permite firmarlos sin ser el dueño.
 */
export async function signSharedDocs(docs: Doc[], ttlSeconds: number) {
  if (!docs.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(
      docs.map((d) => d.storagePath),
      ttlSeconds,
    );
  return new Map(
    (data ?? []).flatMap((item, i) =>
      item.signedUrl ? [[docs[i].id, item.signedUrl] as const] : [],
    ),
  );
}
