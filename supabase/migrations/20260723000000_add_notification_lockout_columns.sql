-- =============================================================================
-- Add lockout columns to notification_subscribers for OTP brute-force protection
-- =============================================================================

ALTER TABLE public.notification_subscribers
    ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.notification_subscribers
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;
