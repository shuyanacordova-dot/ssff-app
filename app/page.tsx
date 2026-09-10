export default function Home() {
  return (
    <main className="page">
      <div className="container">
        <section className="glass" style={{ borderRadius: 28, padding: 40, maxWidth: 760 }}>
          <p style={{ margin: 0, fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase", opacity: .65 }}>SSFF</p>
          <h1 style={{ margin: "10px 0", fontSize: 42 }}>Sistema Óptico</h1>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, opacity: .75 }}>
            Nueva base del sistema ShuVision + Focus. Esta versión se construirá por bloques y quedará respaldada en GitHub.
          </p>
        </section>
      </div>
    </main>
  );
}
