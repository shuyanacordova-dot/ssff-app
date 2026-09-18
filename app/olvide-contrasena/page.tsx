import Link from "next/link";
import { solicitarRecuperacion } from "../login/actions";

type PageProps = { searchParams: Promise<{ error?: string | string[]; enviado?: string | string[] }> };

function valorUnico(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export default async function OlvideContrasenaPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const error = valorUnico(query.error);
  const enviado = valorUnico(query.enviado);

  return (
    <main className="login-page">
      <form action={solicitarRecuperacion} className="login-card">
        <p className="brand-mark"><span className="ring" /> Shuvisión OS</p>
        <h1>Recupera tu contraseña</h1>
        <p className="login-copy">Ingresa el correo con el que inicias sesión; te enviaremos un enlace para crear una contraseña nueva.</p>
        {enviado ? (
          <p className="login-copy">Si ese correo tiene una cuenta activa, te llegará un enlace en unos minutos. Revisa también spam/promociones.</p>
        ) : (
          <>
            <label className="login-field">
              Correo
              <input type="email" name="email" required autoComplete="email" placeholder="nombre@empresa.com" />
            </label>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit">Enviar enlace</button>
          </>
        )}
        <p className="login-copy" style={{ marginTop: 14 }}><Link href="/login">← Volver a iniciar sesión</Link></p>
      </form>
    </main>
  );
}
