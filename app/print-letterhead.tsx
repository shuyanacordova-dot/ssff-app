export type CompanyInfo = { nombre: string; direccion?: string | null; telefono?: string | null; email?: string | null; logo_url?: string | null };

export default function Letterhead({ company, subtitle }: { company: CompanyInfo | null | undefined; subtitle?: string }) {
  const nombre = company?.nombre ?? "SHUVISION OS";
  const meta = [company?.direccion, company?.telefono ? `Tel: ${company.telefono}` : null, company?.email].filter(Boolean).join(" · ");
  return <div className="letterhead">
    {company?.logo_url ? <img src={company.logo_url} alt={nombre} /> : null}
    <div className="letterhead-text">
      <strong>{nombre.toUpperCase()}</strong>
      {meta && <span>{meta}</span>}
      {subtitle && <span>{subtitle}</span>}
    </div>
  </div>;
}
