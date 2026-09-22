alter table public.empresas add column if not exists direccion text, add column if not exists telefono text, add column if not exists email text, add column if not exists logo_url text;
update public.empresas set direccion = 'Av. Napo y Siona, Shushufindi, Sucumbíos', telefono = '0979408384', email = 'shuvisionoptica@gmail.com' where slug = 'shuvision' and direccion is null;;
