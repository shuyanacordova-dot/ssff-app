"use client";

import { useCallback, useEffect, useState } from "react";
import type { SaleProduct, SaleStock } from "@/lib/ventas";
import { obtenerCatalogoVenta } from "./catalogo-actions";

// Carga el catálogo cuando `activo` pasa a verdadero (y cada vez que se vuelve a abrir, para tener el stock al día).
export function useCatalogoVenta(activo: boolean) {
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [stock, setStock] = useState<SaleStock[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const recargar = useCallback(() => {
    setCargando(true); setError("");
    obtenerCatalogoVenta().then((r) => { setProducts(r.products); setStock(r.stock); if (r.error) setError(r.error); })
      .catch(() => setError("No se pudieron cargar los productos."))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => { if (activo) recargar(); }, [activo, recargar]);
  return { products, stock, cargando, error, recargar };
}
