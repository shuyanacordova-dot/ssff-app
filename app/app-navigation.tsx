"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Coins,
  FlaskConical,
  Glasses,
  Home,
  Landmark,
  Menu,
  Package,
  Search,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";

type NavItem = { href: string; label: string; detail: string; icon: typeof Home; group: "Operación" | "Finanzas" | "Administración" };

const primaryItems: NavItem[] = [
  { href: "/", label: "Inicio", detail: "Panel principal", icon: Home, group: "Operación" },
  { href: "/pacientes", label: "Pacientes", detail: "Historias y revisiones", icon: Users, group: "Operación" },
  { href: "/ventas", label: "Ventas", detail: "Cobros y pedidos", icon: Banknote, group: "Operación" },
  { href: "/laboratorio", label: "Laboratorio", detail: "Órdenes y entregas", icon: FlaskConical, group: "Operación" },
  { href: "/agenda", label: "Agenda", detail: "Citas del equipo", icon: CalendarDays, group: "Operación" },
];

const menuItems: NavItem[] = [
  ...primaryItems,
  { href: "/inventario", label: "Inventario", detail: "Monturas, lunas y stock", icon: Package, group: "Operación" },
  { href: "/tareas", label: "Tareas", detail: "Seguimiento del equipo", icon: ClipboardList, group: "Operación" },
  { href: "/caja", label: "Caja", detail: "Cuadre diario", icon: Coins, group: "Finanzas" },
  { href: "/cuentas-cobrar", label: "Cuentas por cobrar", detail: "Saldos y convenios de pago", icon: Wallet, group: "Finanzas" },
  { href: "/convenios", label: "Convenios", detail: "Empresas aliadas", icon: Building2, group: "Finanzas" },
  { href: "/resumen-dia", label: "Resumen del día", detail: "Cierre operativo", icon: Landmark, group: "Finanzas" },
  { href: "/informes", label: "Informes y metas", detail: "Resultados por sucursal", icon: BarChart3, group: "Finanzas" },
  { href: "/equipo", label: "Equipo y accesos", detail: "Usuarios, roles y contraseñas", icon: Users, group: "Administración" },
  { href: "/configuracion/sucursales", label: "Sucursales e identidad", detail: "Logo, contacto y presentación", icon: Settings, group: "Administración" },
];

const hiddenPrefixes = ["/login", "/olvide-contrasena", "/actualizar-contrasena", "/auth", "/recibo/"];
const groups = ["Operación", "Finanzas", "Administración"] as const;

export default function AppNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const hidden = hiddenPrefixes.some((prefix) => pathname.startsWith(prefix));
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? menuItems.filter((item) => `${item.label} ${item.detail} ${item.group}`.toLowerCase().includes(normalized)) : menuItems;
  }, [query]);

  useEffect(() => { setOpen(false); setQuery(""); }, [pathname]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (hidden) return null;
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  return <>
    <header className="app-topbar no-print">
      <div className="app-topbar-inner">
        <Link className="app-nav-brand" href="/" aria-label="Ir al inicio"><Image src="/logos/shuvision-logo.png" alt="ShuVisión" width={36} height={36} priority /><span><strong>ShuVisión</strong><small>Sistema óptico</small></span></Link>
        <nav className="app-primary-nav" aria-label="Navegación principal">{primaryItems.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""}><Icon size={17} /><span>{item.label}</span></Link>; })}</nav>
        <button className="app-menu-trigger" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Abrir menú completo"><Menu size={19} /><span>Menú</span><kbd>⌘K</kbd></button>
      </div>
    </header>

    <nav className="app-mobile-nav no-print" aria-label="Navegación móvil">{primaryItems.slice(0, 4).map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""}><Icon size={19} /><span>{item.label}</span></Link>; })}<button type="button" onClick={() => setOpen(true)}><Menu size={19} /><span>Más</span></button></nav>

    {open && <div className="app-menu-backdrop no-print" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}><section className="app-command-menu" role="dialog" aria-modal="true" aria-labelledby="app-menu-title">
      <div className="app-command-head"><div><p className="section-label">NAVEGACIÓN</p><h2 id="app-menu-title">¿A dónde quieres ir?</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
      <label className="app-command-search"><Search size={18} /><input ref={searchRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pacientes, caja, informes…" /></label>
      <div className="app-command-results">{groups.map((group) => { const items = visibleItems.filter((item) => item.group === group); return items.length ? <section key={group}><h3>{group}</h3><div>{items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""}><span className="app-command-icon"><Icon size={19} /></span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={17} /></Link>; })}</div></section> : null; })}{visibleItems.length === 0 && <div className="app-command-empty"><Glasses size={25} /><p>No encontramos una función con ese nombre.</p></div>}</div>
      <footer><span>La visibilidad de cada módulo depende de tu rol.</span><kbd>Esc</kbd> para cerrar</footer>
    </section></div>}
  </>;
}
