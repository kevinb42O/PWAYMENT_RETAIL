begin;

-- PostgREST can keep an older function catalog after a DDL migration. Reissue
-- the authenticated grant and explicitly reload the API schema so every API
-- worker resolves get_pace_ai_context(uuid, text) immediately.
revoke all on function public.get_pace_ai_context(uuid, text) from public, anon;
grant execute on function public.get_pace_ai_context(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
