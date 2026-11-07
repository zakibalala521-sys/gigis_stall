-- Apply once after supabase_order_workflow_migration.sql and
-- supabase_order_ui_migration.sql. Existing verified Supabase Auth users are
-- linked to public.users by the authenticated profile endpoint.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE;

ALTER TABLE public.users
  ALTER COLUMN password_hash DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.can_read_order(target_customer_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users profile
    WHERE profile.auth_user_id = auth.uid()
      AND profile.status = 'active'
      AND (profile.role = 'owner' OR profile.user_id = target_customer_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_order(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_order(integer) TO authenticated;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.orders TO authenticated;

DROP POLICY IF EXISTS authenticated_order_read ON public.orders;
CREATE POLICY authenticated_order_read
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.can_read_order(customer_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END;
$$;
