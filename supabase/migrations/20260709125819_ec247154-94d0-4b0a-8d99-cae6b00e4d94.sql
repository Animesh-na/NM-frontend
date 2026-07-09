
CREATE TYPE public.log_level AS ENUM ('debug','info','warn','error','fatal');

CREATE TABLE public.app_logs (
  id BIGSERIAL PRIMARY KEY,
  level public.log_level NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  context JSONB,
  stack_trace TEXT,
  fingerprint TEXT,
  url TEXT,
  user_agent TEXT,
  browser TEXT,
  session_id TEXT,
  ip_address TEXT,
  user_id TEXT,
  user_email TEXT,
  component TEXT,
  page TEXT,
  client_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_logs_created_at ON public.app_logs (created_at DESC);
CREATE INDEX idx_app_logs_level ON public.app_logs (level);
CREATE INDEX idx_app_logs_user_id ON public.app_logs (user_id);
CREATE INDEX idx_app_logs_session_id ON public.app_logs (session_id);
CREATE INDEX idx_app_logs_fingerprint ON public.app_logs (fingerprint);

-- No direct client access; all reads/writes go through the `logs` edge function
-- which uses the service role. RLS is enabled with no policies (deny-all).
GRANT ALL ON public.app_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.app_logs_id_seq TO service_role;
ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;
