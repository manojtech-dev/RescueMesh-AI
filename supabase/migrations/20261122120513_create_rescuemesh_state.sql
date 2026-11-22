/*
# Create RescueMesh shared application state

1. New Tables
- `rescuemesh_state` stores the single shared command-center snapshot as JSON so this no-auth demo remains persistent across refreshes and sessions.
- `id` is the stable singleton key.
- `payload` stores incidents, teams, resources, and agent activity.
- `updated_at` records the latest save time.

2. Security
- Row level security is enabled.
- Anonymous and authenticated roles can read and update the intentionally shared demo workspace.
- Four separate CRUD policies are added, and only the required table privileges are granted.

3. Important Notes
- This is a single-tenant operational demo and does not contain private user records.
- The frontend creates the singleton row when it first saves state.
*/

CREATE TABLE IF NOT EXISTS public.rescuemesh_state (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rescuemesh_state ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rescuemesh_state TO anon, authenticated;

DROP POLICY IF EXISTS "Shared state is readable" ON public.rescuemesh_state;
CREATE POLICY "Shared state is readable"
ON public.rescuemesh_state FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Shared state is writable" ON public.rescuemesh_state;
CREATE POLICY "Shared state is writable"
ON public.rescuemesh_state FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Shared state can be updated" ON public.rescuemesh_state;
CREATE POLICY "Shared state can be updated"
ON public.rescuemesh_state FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Shared state can be removed" ON public.rescuemesh_state;
CREATE POLICY "Shared state can be removed"
ON public.rescuemesh_state FOR DELETE
TO anon, authenticated
USING (true);
