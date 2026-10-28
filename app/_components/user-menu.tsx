"use client";

import { signOut } from "@/app/auth/actions";
import type { CurrentUser } from "@/lib/auth";

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <div className="mt-auto flex items-center gap-3 border-t border-white/10 pt-4">
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar externo de GitHub, tamaño fijo
        <img
          src={user.avatarUrl}
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-full ring-2 ring-white/15"
        />
      ) : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">
          {user.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium" title={user.name}>
          {user.name}
        </p>
        {user.username && (
          <p className="truncate text-xs opacity-60">@{user.username}</p>
        )}
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="shrink-0 rounded-full px-3 py-2 text-sm opacity-80 transition hover:bg-white/10 hover:opacity-100"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
