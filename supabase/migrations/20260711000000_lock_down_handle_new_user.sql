-- handle_new_user é só para o trigger on_auth_user_created; não deve ser chamável via API REST
-- (corrige avisos do Supabase security advisor 0028/0029)
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
