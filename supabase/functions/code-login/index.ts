// ============================================================
// code-login
// Public endpoint called from login.html. Looks up a code against
// teachers, then students, then students.parent_code (in that
// order) within one institution, and hands back a one-time
// token_hash the client exchanges for a real, persistent session
// via supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }).
//
// Parent accounts don't exist until the first login with their
// code — this function creates one on demand and links every
// matching sibling under it.
//
// Deploy with: supabase functions deploy code-login
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

function syntheticEmail(code: string, institutionId: string) {
  return `${code.toLowerCase().replace(/-/g, "")}.${institutionId}@codelogin.internal`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const { slug, code } = body;
  if (!slug || !code) return jsonResponse({ error: "missing_fields" }, 400);
  const normalizedCode = code.trim().toUpperCase();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: inst } = await admin
    .from("institutions")
    .select("id, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!inst) return jsonResponse({ error: "institution_not_found" }, 404);
  if (inst.status !== "approved") return jsonResponse({ error: "institution_not_approved" }, 403);

  async function issueSession(profileId: string, role: string) {
    const { data: profile } = await admin
      .from("profiles")
      .select("is_active, full_name")
      .eq("id", profileId)
      .single();
    if (!profile || !profile.is_active) return jsonResponse({ error: "account_inactive" }, 403);

    const email = syntheticEmail(normalizedCode, inst!.id);
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return jsonResponse({ error: "link_error", detail: linkErr?.message }, 500);
    }
    return jsonResponse({
      success: true,
      role,
      full_name: profile.full_name,
      token_hash: linkData.properties.hashed_token,
    });
  }

  // 1. Teacher?
  const { data: teacherRow } = await admin
    .from("teachers")
    .select("profile_id")
    .eq("institution_id", inst.id)
    .eq("code", normalizedCode)
    .maybeSingle();
  if (teacherRow) return await issueSession(teacherRow.profile_id, "teacher");

  // 2. Student (their own code)?
  const { data: studentRow } = await admin
    .from("students")
    .select("profile_id")
    .eq("institution_id", inst.id)
    .eq("code", normalizedCode)
    .maybeSingle();
  if (studentRow) return await issueSession(studentRow.profile_id, "student");

  // 3. Parent (matches one or more students' parent_code)?
  const { data: childRows } = await admin
    .from("students")
    .select("profile_id")
    .eq("institution_id", inst.id)
    .eq("parent_code", normalizedCode);

  if (childRows && childRows.length > 0) {
    let parentProfileId: string;

    const { data: parentRow } = await admin
      .from("parents")
      .select("profile_id")
      .eq("institution_id", inst.id)
      .eq("code", normalizedCode)
      .maybeSingle();

    if (parentRow) {
      parentProfileId = parentRow.profile_id;
    } else {
      const email = syntheticEmail(normalizedCode, inst.id);
      const randomPassword = crypto.randomUUID() + crypto.randomUUID();
      const { data: userData, error: userErr } = await admin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { role: "parent", institution_id: inst.id, code: normalizedCode },
      });
      if (userErr) return jsonResponse({ error: "auth_error", detail: userErr.message }, 500);
      parentProfileId = userData.user!.id;

      const { data: firstChild } = await admin
        .from("students")
        .select("profiles(full_name)")
        .eq("institution_id", inst.id)
        .eq("parent_code", normalizedCode)
        .limit(1)
        .maybeSingle();
      const childName = (firstChild as any)?.profiles?.full_name;
      const parentName = childName ? `دایک/باوکی ${childName}` : "دایک و باوک";

      const { error: profileErr } = await admin.from("profiles").insert({
        id: parentProfileId,
        institution_id: inst.id,
        role: "parent",
        full_name: parentName,
      });
      if (profileErr) {
        await admin.auth.admin.deleteUser(parentProfileId);
        return jsonResponse({ error: "profile_create_failed", detail: profileErr.message }, 500);
      }

      await admin.from("parents").insert({
        profile_id: parentProfileId,
        institution_id: inst.id,
        code: normalizedCode,
      });
    }

    // Link any children matching this parent_code that aren't linked yet
    // (covers both first login and a sibling added later).
    for (const child of childRows) {
      const { data: existingLink } = await admin
        .from("parent_children")
        .select("parent_profile_id")
        .eq("parent_profile_id", parentProfileId)
        .eq("student_profile_id", child.profile_id)
        .maybeSingle();
      if (!existingLink) {
        await admin.from("parent_children").insert({
          parent_profile_id: parentProfileId,
          student_profile_id: child.profile_id,
        });
      }
    }

    return await issueSession(parentProfileId, "parent");
  }

  return jsonResponse({ error: "invalid_code" }, 404);
});
