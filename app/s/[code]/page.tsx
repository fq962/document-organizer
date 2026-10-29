import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { connection } from "next/server";
import { getSharedFolder, signSharedDocs } from "@/lib/shared-folder";
import { extension, formatSize, sharePath } from "@/app/_components/types";

// Las miniaturas se firman al renderizar; abrir un documento firma de nuevo.
const PREVIEW_URL_TTL = 60 * 60;

export const metadata: Metadata = {
  title: "Carpeta compartida · Document Organizer",
  // Los enlaces son privados aunque no pidan sesión.
  robots: { index: false, follow: false },
};

export default function SharedFolderPage(props: PageProps<"/s/[code]">) {
  // El código y la carpeta elegida vienen del request: detrás de Suspense.
  return (
    <Suspense fallback={<div className="h-dvh" aria-busy />}>
      <SharedFolder {...props} />
    </Suspense>
  );
}

async function SharedFolder({ params, searchParams }: PageProps<"/s/[code]">) {
  await connection();
  const { code } = await params;
  const { f } = await searchParams;
  const share = await getSharedFolder(code);
  if (!share) notFound();

  // `?f=` solo puede apuntar a carpetas del subárbol compartido.
  const byId = new Map(share.folders.map((folder) => [folder.id, folder]));
  const folder =
    (typeof f === "string" && byId.get(f)) || byId.get(share.rootId)!;

  const path: (typeof folder)[] = [];
  for (let p: typeof folder | undefined = folder; p;) {
    path.unshift(p);
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  const subfolders = share.folders.filter((s) => s.parentId === folder.id);
  const docs = share.docs.filter((d) => d.folderId === folder.id);
  const previews = await signSharedDocs(
    docs.filter((d) => d.type.startsWith("image/")),
    PREVIEW_URL_TTL,
  );

  const base = sharePath(code);
  const folderHref = (id: string) =>
    id === share.rootId ? base : `${base}?f=${id}`;

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8 sm:py-5">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          {path.map((p, i) => (
            <span
              key={p.id}
              className={`flex min-w-0 items-center gap-1 ${
                i === path.length - 1 ? "shrink" : "shrink-[10]"
              }`}
            >
              {i > 0 && <span className="shrink-0 opacity-40">/</span>}
              <Link
                href={folderHref(p.id)}
                title={p.name}
                className={`truncate rounded-full px-2 py-1 hover:bg-white/10 ${
                  i === path.length - 1
                    ? "text-lg font-semibold sm:text-xl"
                    : "opacity-70"
                }`}
              >
                {p.name}
              </Link>
            </span>
          ))}
        </nav>
        <p className="flex items-center gap-1.5 text-xs opacity-60">
          <Link2 className="size-3.5" aria-hidden />
          {share.ownerName
            ? `Compartida por ${share.ownerName} · solo lectura`
            : "Carpeta compartida · solo lectura"}
        </p>
      </header>

      <div className="flex flex-1 flex-col px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-6">
        {subfolders.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2 sm:mb-6">
            {subfolders.map((s) => (
              <Link
                key={s.id}
                href={folderHref(s.id)}
                style={{ backgroundColor: `hsl(${s.hue} 28% 38% / 0.55)` }}
                className="rounded-full px-4 py-2 text-sm transition hover:brightness-110"
              >
                {s.name}
              </Link>
            ))}
          </div>
        )}

        {docs.length === 0 ? (
          <p className="flex min-h-48 flex-1 items-center justify-center rounded-3xl border-2 border-dashed border-white/20 px-4 text-center opacity-70">
            {subfolders.length
              ? "No hay documentos sueltos en esta carpeta."
              : "Esta carpeta está vacía."}
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] sm:gap-4">
            {docs.map((doc) => {
              const preview = previews.get(doc.id);
              return (
                <li key={doc.id}>
                  <a
                    href={`${base}/d/${doc.id}`}
                    target="_blank"
                    rel="noopener"
                    className="flex flex-col overflow-hidden rounded-2xl bg-black/20 shadow-sm shadow-black/20 transition hover:-translate-y-0.5 hover:bg-black/30"
                  >
                    <span className="flex aspect-[4/3] items-center justify-center bg-white/5">
                      {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage; next/image no aplica
                        <img
                          src={preview}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="rounded-lg bg-white/15 px-2.5 py-1 text-sm font-semibold tracking-wide">
                          {extension(doc.name)}
                        </span>
                      )}
                    </span>
                    <span className="px-3 py-2">
                      <span
                        className="block truncate text-sm font-medium"
                        title={doc.name}
                      >
                        {doc.name}
                      </span>
                      <span className="block text-xs opacity-60">
                        {formatSize(doc.size)}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
