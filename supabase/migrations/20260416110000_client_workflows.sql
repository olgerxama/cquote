-- Client workflow/document collection feature.

CREATE TABLE IF NOT EXISTS public.workflow_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text,
  invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, email),
  UNIQUE (auth_user_id, firm_id)
);

CREATE TABLE IF NOT EXISTS public.client_workflow_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_client_id uuid NOT NULL REFERENCES public.workflow_clients(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, email)
);

CREATE TABLE IF NOT EXISTS public.client_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  workflow_client_id uuid REFERENCES public.workflow_clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'complete')),
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.client_workflows(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  input_type text NOT NULL CHECK (input_type IN ('text', 'file', 'image')),
  step_order int NOT NULL CHECK (step_order >= 1),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'for_review', 'needs_info', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_step_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.client_workflows(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  submitted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_role text NOT NULL CHECK (submitted_by_role IN ('firm_admin', 'client')),
  text_response text,
  file_path text,
  file_name text,
  file_mime_type text,
  file_size bigint,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    text_response IS NOT NULL
    OR file_path IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS workflow_clients_firm_idx ON public.workflow_clients(firm_id);
CREATE INDEX IF NOT EXISTS workflow_clients_auth_idx ON public.workflow_clients(auth_user_id);
CREATE INDEX IF NOT EXISTS client_workflows_firm_idx ON public.client_workflows(firm_id);
CREATE INDEX IF NOT EXISTS client_workflows_client_idx ON public.client_workflows(workflow_client_id);
CREATE INDEX IF NOT EXISTS workflow_steps_workflow_idx ON public.workflow_steps(workflow_id, step_order);
CREATE INDEX IF NOT EXISTS workflow_step_submissions_step_idx ON public.workflow_step_submissions(step_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_workflow_clients_updated_at ON public.workflow_clients;
CREATE TRIGGER trg_workflow_clients_updated_at
BEFORE UPDATE ON public.workflow_clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_client_workflow_invites_updated_at ON public.client_workflow_invites;
CREATE TRIGGER trg_client_workflow_invites_updated_at
BEFORE UPDATE ON public.client_workflow_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_client_workflows_updated_at ON public.client_workflows;
CREATE TRIGGER trg_client_workflows_updated_at
BEFORE UPDATE ON public.client_workflows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_workflow_steps_updated_at ON public.workflow_steps;
CREATE TRIGGER trg_workflow_steps_updated_at
BEFORE UPDATE ON public.workflow_steps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_workflow_client_user(_workflow_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_workflows cw
    JOIN public.workflow_clients wc ON wc.id = cw.workflow_client_id
    WHERE cw.id = _workflow_id
      AND wc.auth_user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.refresh_client_workflow_status(_workflow_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int;
  _complete int;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'complete')
  INTO _total, _complete
  FROM public.workflow_steps
  WHERE workflow_id = _workflow_id;

  UPDATE public.client_workflows
  SET status = CASE
    WHEN _total > 0 AND _total = _complete THEN 'complete'
    ELSE 'in_progress'
  END,
  updated_at = now()
  WHERE id = _workflow_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_workflow_step_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _count int;
BEGIN
  SELECT COUNT(*) INTO _count
  FROM public.workflow_steps
  WHERE workflow_id = NEW.workflow_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF _count >= 10 THEN
    RAISE EXCEPTION 'A workflow can only have up to 10 steps';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_workflow_step_limits ON public.workflow_steps;
CREATE TRIGGER trg_enforce_workflow_step_limits
BEFORE INSERT OR UPDATE ON public.workflow_steps
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workflow_step_limits();

CREATE OR REPLACE FUNCTION public.sync_client_workflow_status_from_steps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _workflow_id uuid;
BEGIN
  _workflow_id := COALESCE(NEW.workflow_id, OLD.workflow_id);
  PERFORM public.refresh_client_workflow_status(_workflow_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_client_workflow_status_from_steps ON public.workflow_steps;
CREATE TRIGGER trg_sync_client_workflow_status_from_steps
AFTER INSERT OR UPDATE OR DELETE ON public.workflow_steps
FOR EACH ROW
EXECUTE FUNCTION public.sync_client_workflow_status_from_steps();

ALTER TABLE public.workflow_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_step_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_workflow_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_clients_select ON public.workflow_clients;
CREATE POLICY workflow_clients_select ON public.workflow_clients
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_firm_member((SELECT auth.uid()), firm_id))
    OR auth_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS workflow_clients_mutate ON public.workflow_clients;
CREATE POLICY workflow_clients_mutate ON public.workflow_clients
  FOR ALL TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)))
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS client_workflow_invites_no_client_access ON public.client_workflow_invites;
CREATE POLICY client_workflow_invites_no_client_access ON public.client_workflow_invites
  FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS client_workflows_select ON public.client_workflows;
CREATE POLICY client_workflows_select ON public.client_workflows
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_firm_member((SELECT auth.uid()), firm_id))
    OR (workflow_client_id IS NOT NULL AND (SELECT public.is_workflow_client_user(id, (SELECT auth.uid()))))
  );

DROP POLICY IF EXISTS client_workflows_insert ON public.client_workflows;
CREATE POLICY client_workflows_insert ON public.client_workflows
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS client_workflows_update ON public.client_workflows;
CREATE POLICY client_workflows_update ON public.client_workflows
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)))
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS client_workflows_delete ON public.client_workflows;
CREATE POLICY client_workflows_delete ON public.client_workflows
  FOR DELETE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS workflow_steps_select ON public.workflow_steps;
CREATE POLICY workflow_steps_select ON public.workflow_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_workflows cw
      WHERE cw.id = workflow_steps.workflow_id
        AND (
          (SELECT public.is_firm_member((SELECT auth.uid()), cw.firm_id))
          OR (SELECT public.is_workflow_client_user(cw.id, (SELECT auth.uid())))
        )
    )
  );

DROP POLICY IF EXISTS workflow_steps_mutate ON public.workflow_steps;
CREATE POLICY workflow_steps_mutate ON public.workflow_steps
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_workflows cw
      WHERE cw.id = workflow_steps.workflow_id
      AND (SELECT public.is_firm_admin((SELECT auth.uid()), cw.firm_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_workflows cw
      WHERE cw.id = workflow_steps.workflow_id
      AND (SELECT public.is_firm_admin((SELECT auth.uid()), cw.firm_id))
    )
  );

DROP POLICY IF EXISTS workflow_step_submissions_select ON public.workflow_step_submissions;
CREATE POLICY workflow_step_submissions_select ON public.workflow_step_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_workflows cw
      WHERE cw.id = workflow_step_submissions.workflow_id
        AND (
          (SELECT public.is_firm_member((SELECT auth.uid()), cw.firm_id))
          OR (SELECT public.is_workflow_client_user(cw.id, (SELECT auth.uid())))
        )
    )
  );

DROP POLICY IF EXISTS workflow_step_submissions_insert ON public.workflow_step_submissions;
CREATE POLICY workflow_step_submissions_insert ON public.workflow_step_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.client_workflows cw
      WHERE cw.id = workflow_step_submissions.workflow_id
        AND (
          (SELECT public.is_firm_member((SELECT auth.uid()), cw.firm_id))
          OR (SELECT public.is_workflow_client_user(cw.id, (SELECT auth.uid())))
        )
    )
  );

DROP POLICY IF EXISTS workflow_step_submissions_delete ON public.workflow_step_submissions;
CREATE POLICY workflow_step_submissions_delete ON public.workflow_step_submissions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_workflows cw
      WHERE cw.id = workflow_step_submissions.workflow_id
        AND (SELECT public.is_firm_admin((SELECT auth.uid()), cw.firm_id))
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('workflow-documents', 'workflow-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_workflow_document(_object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_workflows cw
    WHERE _object_name LIKE ('workflow/' || cw.id || '/%')
      AND (
        public.is_firm_member((SELECT auth.uid()), cw.firm_id)
        OR public.is_workflow_client_user(cw.id, (SELECT auth.uid()))
      )
  );
$$;

DROP POLICY IF EXISTS workflow_documents_insert ON storage.objects;
CREATE POLICY workflow_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'workflow-documents'
    AND public.can_access_workflow_document(name)
  );

DROP POLICY IF EXISTS workflow_documents_select ON storage.objects;
CREATE POLICY workflow_documents_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'workflow-documents'
    AND public.can_access_workflow_document(name)
  );

DROP POLICY IF EXISTS workflow_documents_update ON storage.objects;
CREATE POLICY workflow_documents_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'workflow-documents'
    AND public.can_access_workflow_document(name)
  )
  WITH CHECK (
    bucket_id = 'workflow-documents'
    AND public.can_access_workflow_document(name)
  );

DROP POLICY IF EXISTS workflow_documents_delete ON storage.objects;
CREATE POLICY workflow_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'workflow-documents'
    AND public.can_access_workflow_document(name)
  );
