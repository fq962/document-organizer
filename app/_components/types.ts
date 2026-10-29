export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  hue: number;
  isRoot: boolean;
  /** Código del enlace público ("/s/<code>") si la carpeta está compartida. */
  shareCode: string | null;
};

export type Doc = {
  id: string;
  name: string;
  size: number;
  type: string;
  folderId: string;
  addedAt: number;
  /** Ruta del archivo en el bucket de Storage: "<user_id>/<doc_id>". */
  storagePath: string;
  /** Mientras se sube a Storage. */
  uploading?: boolean;
  /** Vista previa local (object URL) de archivos subidos en esta sesión. */
  localUrl?: string;
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

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Etiqueta corta para la tarjeta de un archivo sin vista previa: "PDF". */
export function extension(name: string) {
  const { ext } = splitName(name);
  return ext ? ext.toUpperCase().slice(0, 4) : "FILE";
}

/** Formato de los códigos de enlace que genera la base. */
export const SHARE_CODE_PATTERN = /^[0-9A-Za-z]{8}$/;

export const sharePath = (code: string) => `/s/${code}`;
