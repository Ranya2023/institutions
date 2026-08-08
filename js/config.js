// ============================================================
// Fill these in after you create the Supabase project.
// SUPABASE_ANON_KEY is safe to expose in client code — it only
// works within the RLS policies from 01_schema.sql.
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://bxxrgipfwrxdqdaxgqzk.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4eHJnaXBmd3J4ZHFkYXhncXprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNzk1OTcsImV4cCI6MjEwMTY1NTU5N30.s_9cSGPZyUUNpRlHawtnyJEjbDMxL3b0JSGM7di2OWY",
  SIGNUP_FUNCTION_URL: "https://bxxrgipfwrxdqdaxgqzk.supabase.co/functions/v1/signup-institution",
  CREATE_MEMBER_FUNCTION_URL: "https://bxxrgipfwrxdqdaxgqzk.supabase.co/functions/v1/create-member",
  CODE_LOGIN_FUNCTION_URL: "https://bxxrgipfwrxdqdaxgqzk.supabase.co/functions/v1/code-login",
  // Safe to expose publicly — this is only the public half of the key pair.
  // Generate your own pair with: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: "BHp_1wwy1SICC0Y8tQpDQ06DP4YSAGegE66WvgnJuhuRlqT4guDWOSzclL0fDNaZQOC4mv7Bn-0sPkv-P32_4kM",
  GAS_WEBHOOK_URL: "" // wired up in Phase 7 (email notifications)
};
