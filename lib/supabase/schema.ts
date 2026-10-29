/** Esquema de Postgres donde viven las tablas de la app. */
export const DB_SCHEMA = "document_organizer";

/** Bucket privado de Storage con los archivos. */
export const STORAGE_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "documents";

export type FolderRow = {
  id: string;
  parent_id: string | null;
  name: string;
  hue: number;
  is_root: boolean;
};

export type DocumentRow = {
  id: string;
  folder_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
};

export type FolderShareRow = {
  folder_id: string;
  code: string;
};

/** Lo que devuelve la RPC `get_shared_folder` (vista pública de un enlace). */
export type SharedFolderPayload = {
  root_id: string;
  owner_name: string | null;
  folders: Omit<FolderRow, "is_root">[];
  documents: DocumentRow[];
};

export const FOLDER_COLUMNS = "id, parent_id, name, hue, is_root";
export const DOCUMENT_COLUMNS =
  "id, folder_id, name, mime_type, size_bytes, storage_path, created_at";
export const FOLDER_SHARE_COLUMNS = "folder_id, code";
