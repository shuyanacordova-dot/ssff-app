# Instrucciones para agentes de IA (Codex, Claude)

Antes de cualquier tarea, lee `docs/BLUEPRINT.md` completo. Ahí están la visión, las reglas de trabajo, el estado de cada módulo y la bitácora de errores que no se deben repetir.

Reglas mínimas:
- Nunca borres trabajo existente (archivos, ramas, columnas o tablas). No uses `git reset --hard` ni `git checkout .`.
- Cambios de base de datos: nuevo archivo en `supabase/migrations/` con timestamp; nunca editar migraciones viejas.
- Verifica con `npx tsc --noEmit` antes de terminar.
- Al terminar, actualiza en `docs/BLUEPRINT.md` la tabla de estado (sección 3), la bitácora de errores (sección 6) si hubo alguno, y el registro de entregas (sección 9).
- Interfaz en español, estilo glass existente en `app/globals.css`.
