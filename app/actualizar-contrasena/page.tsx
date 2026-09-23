import { actualizarContrasena } from "../login/actions";

type PageProps = { searchParams: Promise<{ error?: string | string[] }> };

function valorUnico(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export default async function ActualizarContrasenaPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const error = valorUnico(query.error);

  return (
    <main className="login-page">
      <form action={actualizarContrasena} className="login-card">
        <p className="brand-mark"><span className="ring" /> LumOS</p>
        <h1>Crea tu nueva contraseña</h1>
        <p className="login-copy">Elige una contraseña nueva de al menos 8 caracteres.</p>
        <label className="login-field">
          Contraseña nueva
          <input type="password" name="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
        </label>
        <label className="login-field">
          Confirmar contraseña
          <input type="password" name="confirmacion" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" type="submit">Guardar contraseña</button>
      </form>
    </main>
  );
}
