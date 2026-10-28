export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  hue: number;
};

export type Doc = {
  id: string;
  name: string;
  size: number;
  type: string;
  folderId: string;
  addedAt: number;
  url: string;
};

// Tipo MIME usado para arrastrar documentos internos entre carpetas,
// distinto de "Files" que es el que usa el sistema operativo.
export const DOC_DRAG_TYPE = "application/x-document-id";
