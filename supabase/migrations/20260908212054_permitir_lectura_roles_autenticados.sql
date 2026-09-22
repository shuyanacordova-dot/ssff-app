create policy "usuarios autenticados leen roles"
  on roles for select
  using (auth.role() = 'authenticated');;
