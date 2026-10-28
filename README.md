# Document Organizer

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador.

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — build de producción
- `npm run start` — servir el build
- `npm run lint` — ESLint

## Autenticación (Supabase + GitHub)

1. **GitHub** → Settings → Developer settings → OAuth Apps → *New OAuth App*:
   - *Homepage URL*: `http://localhost:3000`
   - *Authorization callback URL*: `https://<tu-proyecto>.supabase.co/auth/v1/callback`
2. **Supabase** → Authentication → Sign In / Providers → GitHub: activa el
   proveedor y pega el *Client ID* y *Client Secret* de la OAuth App.
3. **Supabase** → Authentication → URL Configuration:
   - *Site URL*: `http://localhost:3000`
   - *Redirect URLs*: `http://localhost:3000/auth/callback` (y la de producción)
4. Copia `.env.example` a `.env.local` y completa `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
