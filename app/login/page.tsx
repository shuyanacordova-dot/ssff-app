import Link from "next/link";
import { iniciarSesion } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[]; next?: string | string[]; enviado?: string | string[] }>;
};

function valorUnico(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const error = valorUnico(query.error);
  const next = valorUnico(query.next, "/");
  const enviado = valorUnico(query.enviado);

  return (
    <main className="login-page">
      <form action={iniciarSesion} className="login-card">
        <p className="brand-mark"><span className="ring" /> Shuvisión OS</p>
        <h1>Ingresa a tu cuenta</h1>
        <p className="login-copy">Tu rol define qué información puedes ver y qué acciones puedes realizar.</p>
        <input type="hidden" name="next" value={next} />
        <label className="login-field">
          Correo
          <input type="email" name="email" required autoComplete="email" placeholder="nombre@empresa.com" />
        </label>
        <label className="login-field">
          Contraseña
          <input type="password" name="password" required autoComplete="current-password" placeholder="••••••••" />
        </label>
        {enviado === "contrasena-actualizada" && <p className="login-copy">Tu contraseña se actualizó. Ya puedes iniciar sesión.</p>}
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" type="submit">Iniciar sesión</button>
        <p className="login-copy" style={{ marginTop: 14 }}><Link href="/olvide-contrasena">¿Olvidaste tu contraseña?</Link></p>
      </form>
    </main>
  );
}
