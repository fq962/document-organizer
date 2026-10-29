import { createClient } from "@/lib/supabase/server";
import {
  DOCUMENT_COLUMNS,
  FOLDER_COLUMNS,
  FOLDER_SHARE_COLUMNS,
  type DocumentRow,
  type FolderRow,
  type FolderShareRow,
} from "@/lib/supabase/schema";
import type { Doc, Folder } from "@/app/_components/types";

export type OrganizerData = {
  rootId: string;
  folders: Folder[];
  docs: Doc[];
};

export function folderFromRow(
  row: FolderRow,
  shareCode: string | null = null,
): Folder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    hue: row.hue,
    isRoot: row.is_root,
    shareCode,
  };
}

export function docFromRow(row: DocumentRow): Doc {
  return {
    id: row.id,
    name: row.name,
    size: row.size_bytes,
    type: row.mime_type,
    folderId: row.folder_id,
    addedAt: new Date(row.created_at).getTime(),
    storagePath: row.storage_path,
  };
}

/**
 * Carpetas y documentos del usuario de la sesión. RLS filtra por usuario, así
 * que no hace falta (ni se debe confiar en) pasar el id desde afuera.
 */
export async function getOrganizerData(): Promise<OrganizerData> {
  const supabase = await createClient();
  const [folders, documents, shares] = await Promise.all([
    supabase.from("folders").select(FOLDER_COLUMNS).order("created_at"),
    supabase
      .from("documents")
      .select(DOCUMENT_COLUMNS)
      .order("created_at", { ascending: false }),
    supabase.from("folder_shares").select(FOLDER_SHARE_COLUMNS),
  ]);

  const error = folders.error ?? documents.error ?? shares.error;
  if (error) {
    // Error típico: el esquema no está en Project Settings → Data API →
    // Exposed schemas, o la migración no se corrió.
    // PostgrestError no serializa bien en consola: se loguean sus campos.
    const { code, message, hint, details } = error;
    console.error("No se pudieron cargar carpetas/documentos:", {
      code,
      message,
      hint,
      details,
    });
    throw new Error(
      `No se pudieron cargar tus documentos: ${message}${hint ? ` (${hint})` : ""}`,
    );
  }

  const folderRows = folders.data as FolderRow[];
  const root = folderRows.find((f) => f.is_root);
  if (!root) {
    // La crea el trigger al registrarse; si falta, la migración no corrió
    // completa (incluye un backfill para usuarios existentes).
    throw new Error("No se encontró tu carpeta raíz «documentos».");
  }

  const shareCodes = new Map(
    (shares.data as FolderShareRow[]).map((s) => [s.folder_id, s.code]),
  );

  return {
    rootId: root.id,
    folders: folderRows.map((row) =>
      folderFromRow(row, shareCodes.get(row.id) ?? null),
    ),
    docs: (documents.data as DocumentRow[]).map(docFromRow),
  };
}
