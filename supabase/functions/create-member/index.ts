// ============================================================
// create-member
// Called by an authenticated institution_admin from admin.html to
// create a teacher or student. Institution ID is resolved from the
// caller's own profile server-side — never trusted from the client.
// Generates a permanent XXXX-XXXX login code and a synthetic auth
// user (no password shown to anyone); the person logs in with the
// code via the "code-login" function built in Phase 5.
// Deploy with: supabase functions deploy create-member
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

function generateCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const part = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part()}-${part()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return jsonResponse({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the caller and resolve their institution server-side
  const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !callerData?.user) return jsonResponse({ error: "unauthorized" }, 401);

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role, institution_id, is_active")
    .eq("id", callerData.user.id)
    .single();

  if (!callerProfile || callerProfile.role !== "institution_admin" || !callerProfile.is_active) {
    return jsonResponse({ error: "forbidden" }, 403);
  }
  const institutionId = callerProfile.institution_id;

  const { data: inst } = await admin
    .from("institutions")
    .select("status")
    .eq("id", institutionId)
    .single();
  if (!inst || inst.status !== "approved") {
    return jsonResponse({ error: "institution_not_approved" }, 403);
  }

  let body: Record<string, string> & { stage_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const { role, full_name, subject, phone, stage_id, group_id, parent_code, date_of_birth, stage_ids } = body;
  if (!["teacher", "student"].includes(role)) return jsonResponse({ error: "invalid_role" }, 400);
  if (!full_name) return jsonResponse({ error: "missing_fields" }, 400);
  if (role === "student" && !parent_code) return jsonResponse({ error: "missing_parent_code" }, 400);

  const table = role === "teacher" ? "teachers" : "students";

  // Unique code within this institution
  let code = generateCode();
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data: existing } = await admin
      .from(table)
      .select("profile_id")
      .eq("institution_id", institutionId)
      .eq("code", code)
      .maybeSingle();
    if (!existing) break;
    code = generateCode();
  }

  const syntheticEmail = `${code.toLowerCase().replace("-", "")}.${institutionId}@codelogin.internal`;
  const randomPassword = crypto.randomUUID() + crypto.randomUUID();

  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: randomPassword,
    email_confirm: true,
    user_metadata: { role, institution_id: institutionId, code },
  });
  if (userErr) return jsonResponse({ error: "auth_error", detail: userErr.message }, 400);
  const userId = userData.user!.id;

  const { error: profileErr } = await admin.from("profiles").insert({
    id: userId,
    institution_id: institutionId,
    role,
    full_name,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    return jsonResponse({ error: "profile_create_failed", detail: profileErr.message }, 500);
  }

  if (role === "teacher") {
    const { error: teacherErr } = await admin.from("teachers").insert({
      profile_id: userId,
      institution_id: institutionId,
      code,
      subject: subject || null,
      phone: phone || null,
    });
    if (teacherErr) {
      await admin.auth.admin.deleteUser(userId);
      await admin.from("profiles").delete().eq("id", userId);
      return jsonResponse({ error: "teacher_create_failed", detail: teacherErr.message }, 500);
    }

    if (Array.isArray(stage_ids) && stage_ids.length) {
      const rows = stage_ids.map((sid) => ({
        teacher_profile_id: userId,
        stage_id: sid,
        institution_id: institutionId,
      }));
      await admin.from("teacher_stages").insert(rows);
      // Not fatal if this fails — the teacher still exists, just unrestricted.
    }
  } else {
    const { error: studentErr } = await admin.from("students").insert({
      profile_id: userId,
      institution_id: institutionId,
      code,
      stage_id: stage_id || null,
      group_id: group_id || null,
      parent_code: parent_code.toUpperCase(),
      date_of_birth: date_of_birth || null,
    });
    if (studentErr) {
      await admin.auth.admin.deleteUser(userId);
      await admin.from("profiles").delete().eq("id", userId);
      return jsonResponse({ error: "student_create_failed", detail: studentErr.message }, 500);
    }
  }

  return jsonResponse({ success: true, profile_id: userId, code });
});
