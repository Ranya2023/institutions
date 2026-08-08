// ============================================================
// signup-institution
// Public endpoint called from signup.html. Uses the service role
// key (never exposed to the client) to atomically:
//   1. create the institution-admin auth user (email confirmed)
//   2. create the institution row (status = 'pending')
//   3. create the profile row (role = 'institution_admin')
// Deploy with:
//   supabase functions deploy signup-institution
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... (usually auto-set)
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function slugify(text: string): string {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const {
    institution_name,
    location,
    institution_email,
    phone,
    admin_name,
    admin_email,
    admin_password,
  } = body;

  if (!institution_name || !institution_email || !admin_name || !admin_email || !admin_password) {
    return jsonResponse({ error: "missing_fields" }, 400);
  }
  if (admin_password.length < 8) {
    return jsonResponse({ error: "weak_password" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find a unique slug for the institution's public login link (/l/{slug})
  let slug = slugify(institution_name) || "institution";
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const { data: existing } = await admin
      .from("institutions")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!existing) {
      slug = candidate;
      break;
    }
    attempt++;
    if (attempt > 50) return jsonResponse({ error: "slug_taken" }, 409);
  }

  // 1. Create the auth user (email pre-confirmed — no confirmation email step)
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: admin_email,
    password: admin_password,
    email_confirm: true,
    user_metadata: { role: "institution_admin" },
  });
  if (userErr) {
    const code = userErr.message?.toLowerCase().includes("already registered")
      ? "email_taken"
      : "auth_error";
    return jsonResponse({ error: code, detail: userErr.message }, 400);
  }
  const userId = userData.user!.id;

  // 2. Create the institution (pending approval)
  const { data: inst, error: instErr } = await admin
    .from("institutions")
    .insert({
      slug,
      name: institution_name,
      location: location || null,
      email: institution_email,
      phone: phone || null,
      status: "pending",
    })
    .select()
    .single();

  if (instErr) {
    await admin.auth.admin.deleteUser(userId);
    return jsonResponse({ error: "institution_create_failed", detail: instErr.message }, 500);
  }

  // 3. Create the profile
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .insert({
      id: userId,
      institution_id: inst.id,
      role: "institution_admin",
      full_name: admin_name,
    })
    .select()
    .single();

  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    await admin.from("institutions").delete().eq("id", inst.id);
    return jsonResponse({ error: "profile_create_failed", detail: profileErr.message }, 500);
  }

  // 4. Link the institution back to its admin profile
  await admin.from("institutions").update({ admin_profile_id: profile.id }).eq("id", inst.id);

  return jsonResponse({ success: true, institution_id: inst.id, slug });
});
