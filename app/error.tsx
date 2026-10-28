"use client";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-black/20 p-8 text-center shadow-2xl shadow-black/30 ring-1 ring-white/10">
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        {/* En producción Next oculta el mensaje real; solo queda el digest. */}
        <p className="mt-3 text-sm opacity-75">
          {process.env.NODE_ENV === "development"
            ? error.message
            : "No se pudieron cargar tus documentos. Intenta de nuevo en un momento."}
        </p>
        <button
          onClick={() => retry()}
          className="mt-6 h-11 rounded-full bg-white/90 px-6 text-sm font-medium text-[#3a4230] transition hover:bg-white"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
