import Link from "next/link";

export default function SharedFolderNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-black/20 p-8 text-center shadow-2xl shadow-black/30 ring-1 ring-white/10">
        <h1 className="text-xl font-semibold">Enlace no disponible</h1>
        <p className="mt-3 text-sm opacity-75">
          Este enlace no existe o su dueño dejó de compartir la carpeta.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-white/90 px-6 text-sm font-medium text-[#3a4230] transition hover:bg-white"
        >
          Ir a Document Organizer
        </Link>
      </div>
    </main>
  );
}
