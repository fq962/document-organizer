import { Suspense } from "react";
import type { Metadata } from "next";
import { signInWithGitHub } from "@/app/auth/actions";
import { GitHubButton, LoginError } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión · Document Organizer",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-black/20 p-8 text-center shadow-2xl shadow-black/30 ring-1 ring-white/10">
        <div
          aria-hidden
          className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-[hsl(95_26%_48%)]"
        >
          <svg viewBox="0 0 24 24" className="size-7" fill="currentColor">
            <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2 2 0 0 1 1.4.6L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Document Organizer
        </h1>
        <p className="mt-2 text-sm opacity-70">
          Inicia sesión para organizar tus documentos.
        </p>

        <form action={signInWithGitHub} className="mt-8">
          <GitHubButton />
        </form>

        {/* useSearchParams lee datos del request: va detrás de Suspense. */}
        <Suspense>
          <LoginError />
        </Suspense>
      </div>
    </main>
  );
}
