-- Durable invite tracking so invited users can always be attached to the
-- inviting firm by email during acceptance, even if auth user ids differ.

CREATE TABLE IF NOT EXISTS public.firm_user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'read_only')),
  invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS firm_user_invites_unique_firm_email
  ON public.firm_user_invites (firm_id, email);

CREATE INDEX IF NOT EXISTS firm_user_invites_email_idx
  ON public.firm_user_invites (lower(email));

DROP TRIGGER IF EXISTS trg_firm_user_invites_updated_at ON public.firm_user_invites;
CREATE TRIGGER trg_firm_user_invites_updated_at
BEFORE UPDATE ON public.firm_user_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
