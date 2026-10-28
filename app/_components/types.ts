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

/** Separa "informe.final.pdf" en { base: "informe.final", ext: "pdf" }. */
export function splitName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? { base: name.slice(0, dot), ext: name.slice(dot + 1) }
    : { base: name, ext: "" };
}
