"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET } from "@/lib/supabase/schema";
import type { Doc, Folder } from "./types";

const HUES = [95, 140, 45, 25, 180, 205, 275, 340];
const NEW_FOLDER_NAME = "Nueva carpeta";
// Duración de los enlaces firmados (el bucket es privado).
const OPEN_URL_TTL = 60;
const PREVIEW_URL_TTL = 60 * 60;

type DbError = { code?: string; message: string };

function describe(error: DbError) {
  if (error.code === "23505")
    return "Ya existe una carpeta con ese nombre aquí.";
  return error.message;
}

export function descendantIds(folders: Folder[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** "Nueva carpeta", "Nueva carpeta 2"… sin chocar con el índice único. */
function uniqueName(base: string, siblings: Folder[]) {
  const taken = new Set(siblings.map((f) => f.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const name = `${base} ${i}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/**
 * Estado del organizador sincronizado con Supabase. Cada cambio se aplica
 * primero en pantalla (optimista) y, si la base lo rechaza, se revierte y se
 * muestra el error.
 */
export function useOrganizerStore({
  userId,
  initialFolders,
  initialDocs,
}: {
  userId: string;
  initialFolders: Folder[];
  initialDocs: Doc[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [folders, setFolders] = useState(initialFolders);
  const [docs, setDocs] = useState(initialDocs);
  const [error, setError] = useState<string | null>(null);

  // Última versión del estado para leerla dentro de callbacks estables.
  const foldersRef = useRef(folders);
  const docsRef = useRef(docs);
  useEffect(() => {
    foldersRef.current = folders;
    docsRef.current = docs;
  });

  // Carpetas cuya inserción sigue en curso. Renombrar, borrar o subir algo a
  // una carpeta recién creada espera a que exista en la base.
  const pendingCreates = useRef(new Map<string, Promise<boolean>>());
  const created = (id: string) =>
    pendingCreates.current.get(id) ?? Promise.resolve(true);

  const dismissError = useCallback(() => setError(null), []);

  const removeFiles = useCallback(
    async (removed: Doc[]) => {
      for (const d of removed) if (d.localUrl) URL.revokeObjectURL(d.localUrl);
      const paths = removed
        .filter((d) => !d.uploading)
        .map((d) => d.storagePath);
      if (!paths.length) return;
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(paths);
      // Las filas ya no existen; un archivo que no se pudo borrar queda huérfano
      // en Storage pero no afecta al usuario.
      if (error)
        console.warn("No se pudieron borrar archivos de Storage:", error);
    },
    [supabase],
  );

  const createFolder = useCallback(
    (parentId: string, hue?: number) => {
      const current = foldersRef.current;
      const folder: Folder = {
        id: crypto.randomUUID(),
        name: uniqueName(
          NEW_FOLDER_NAME,
          current.filter((f) => f.parentId === parentId),
        ),
        parentId,
        hue: hue ?? HUES[current.length % HUES.length],
        isRoot: false,
      };
      // Inmediato, por si se crea otra antes del siguiente render.
      foldersRef.current = [...current, folder];
      setFolders((prev) => [...prev, folder]);

      const insert = created(parentId).then(async (parentOk) => {
        const { error } = parentOk
          ? await supabase.from("folders").insert({
              id: folder.id,
              parent_id: parentId,
              name: folder.name,
              hue: folder.hue,
            })
          : { error: { message: "La carpeta padre no se pudo crear." } };
        pendingCreates.current.delete(folder.id);
        if (!error) return true;
        setFolders((prev) => prev.filter((f) => f.id !== folder.id));
        setError(`No se pudo crear la carpeta: ${describe(error)}`);
        return false;
      });
      pendingCreates.current.set(folder.id, insert);
      return folder.id;
    },
    [supabase],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const before = foldersRef.current.find((f) => f.id === id);
      if (!before || before.name === name) return;
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));

      if (!(await created(id))) return;
      const { error } = await supabase
        .from("folders")
        .update({ name })
        .eq("id", id);
      if (!error) return;
      setFolders((prev) =>
        prev.map((f) => (f.id === id ? { ...f, name: before.name } : f)),
      );
      setError(`No se pudo renombrar: ${describe(error)}`);
    },
    [supabase],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      const all = foldersRef.current;
      const target = all.find((f) => f.id === id);
      if (!target || target.isRoot) return;

      const ids = descendantIds(all, id);
      const removedFolders = all.filter((f) => ids.has(f.id));
      const removedDocs = docsRef.current.filter((d) => ids.has(d.folderId));
      setFolders((prev) => prev.filter((f) => !ids.has(f.id)));
      setDocs((prev) => prev.filter((d) => !ids.has(d.folderId)));

      if (!(await created(id))) return;
      // Subcarpetas y filas de documentos se borran en cascada en la base.
      const { error } = await supabase.from("folders").delete().eq("id", id);
      if (error) {
        setFolders((prev) => [...prev, ...removedFolders]);
        setDocs((prev) => [...removedDocs, ...prev]);
        setError(`No se pudo eliminar la carpeta: ${describe(error)}`);
        return;
      }
      await removeFiles(removedDocs);
    },
    [supabase, removeFiles],
  );

  const addFiles = useCallback(
    async (files: FileList | File[], folderId: string) => {
      const list = Array.from(files);
      if (!list.length) return;
      const added: Doc[] = list.map((file) => {
        const id = crypto.randomUUID();
        return {
          id,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          folderId,
          addedAt: Date.now(),
          storagePath: `${userId}/${id}`,
          uploading: true,
          localUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined,
        };
      });
      setDocs((prev) => [...added, ...prev]);

      const discard = (doc: Doc, message: string) => {
        if (doc.localUrl) URL.revokeObjectURL(doc.localUrl);
        setDocs((prev) => prev.filter((d) => d.id !== doc.id));
        setError(message);
      };

      const folderOk = await created(folderId);
      await Promise.all(
        added.map(async (doc, i) => {
          if (!folderOk) return discard(doc, `No se pudo subir “${doc.name}”.`);

          const upload = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(doc.storagePath, list[i], { contentType: doc.type });
          if (upload.error) {
            return discard(
              doc,
              `No se pudo subir “${doc.name}”: ${upload.error.message}`,
            );
          }

          const { error } = await supabase.from("documents").insert({
            id: doc.id,
            folder_id: doc.folderId,
            name: doc.name,
            mime_type: doc.type,
            size_bytes: doc.size,
            storage_path: doc.storagePath,
          });
          if (error) {
            await supabase.storage
              .from(STORAGE_BUCKET)
              .remove([doc.storagePath]);
            return discard(
              doc,
              `No se pudo guardar “${doc.name}”: ${describe(error)}`,
            );
          }

          setDocs((prev) =>
            prev.map((d) => (d.id === doc.id ? { ...d, uploading: false } : d)),
          );
        }),
      );
    },
    [supabase, userId],
  );

  const moveDoc = useCallback(
    async (docId: string, folderId: string) => {
      const doc = docsRef.current.find((d) => d.id === docId);
      if (!doc || doc.uploading || doc.folderId === folderId) return;
      const restore = () =>
        setDocs((prev) =>
          prev.map((d) =>
            d.id === docId ? { ...d, folderId: doc.folderId } : d,
          ),
        );
      setDocs((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, folderId } : d)),
      );

      if (!(await created(folderId))) return restore();
      const { error } = await supabase
        .from("documents")
        .update({ folder_id: folderId })
        .eq("id", docId);
      if (!error) return;
      restore();
      setError(`No se pudo mover “${doc.name}”: ${describe(error)}`);
    },
    [supabase],
  );

  const removeDoc = useCallback(
    async (docId: string) => {
      const doc = docsRef.current.find((d) => d.id === docId);
      if (!doc || doc.uploading) return;
      setDocs((prev) => prev.filter((d) => d.id !== docId));

      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", docId);
      if (error) {
        setDocs((prev) => [doc, ...prev]);
        setError(`No se pudo eliminar “${doc.name}”: ${describe(error)}`);
        return;
      }
      await removeFiles([doc]);
    },
    [supabase, removeFiles],
  );

  const openDoc = useCallback(
    async (doc: Doc) => {
      if (doc.uploading && doc.localUrl) {
        window.open(doc.localUrl, "_blank", "noopener");
        return;
      }
      // Se abre la pestaña antes del await: si no, el navegador la bloquea
      // por no venir directo de un clic.
      const tab = window.open("", "_blank");
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(doc.storagePath, OPEN_URL_TTL);
      if (error || !data) {
        tab?.close();
        setError(`No se pudo abrir “${doc.name}”.`);
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = data.signedUrl;
      } else {
        window.open(data.signedUrl, "_blank", "noopener");
      }
    },
    [supabase],
  );

  return {
    folders,
    docs,
    error,
    dismissError,
    createFolder,
    renameFolder,
    deleteFolder,
    addFiles,
    moveDoc,
    removeDoc,
    openDoc,
  };
}

/**
 * Enlaces firmados para las miniaturas de imágenes guardadas en Storage. Las
 * subidas en esta sesión usan su vista previa local.
 */
export function useImagePreviews(docs: Doc[]) {
  const supabase = useMemo(() => createClient(), []);
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());

  const missing = useMemo(
    () =>
      docs.filter(
        (d) =>
          d.type.startsWith("image/") &&
          !d.uploading &&
          !d.localUrl &&
          !urls.has(d.id),
      ),
    [docs, urls],
  );

  useEffect(() => {
    if (!missing.length) return;
    let cancelled = false;
    supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls(
        missing.map((d) => d.storagePath),
        PREVIEW_URL_TTL,
      )
      .then(({ data }) => {
        if (cancelled || !data) return;
        const found = data.flatMap((item, i) =>
          item.signedUrl ? [[missing[i].id, item.signedUrl] as const] : [],
        );
        // Solo actualizar si hay algo nuevo; si no, el efecto se repetiría.
        if (found.length) setUrls((prev) => new Map([...prev, ...found]));
      });
    return () => {
      cancelled = true;
    };
  }, [missing, supabase]);

  return useCallback((doc: Doc) => doc.localUrl ?? urls.get(doc.id), [urls]);
}
