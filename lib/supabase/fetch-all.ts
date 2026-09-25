// El servidor de Supabase devuelve como máximo 1.000 filas por consulta. Para catálogos grandes
// (productos, stock) se piden por páginas hasta traer todo. La consulta debe tener un orden estable.
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAll<T>(page: (from: number, to: number) => Page<T>, pageSize = 1000, maxRows = 20000): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return { data: rows, error: null };
}
