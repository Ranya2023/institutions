// ============================================================
// send-push
// NOT called from the browser. Triggered by a pg_net database
// trigger (see 06_phase6_patches.sql) whenever a row is inserted
// into notifications, notes, or assessments. Resolves who should
// be notified, then sends real Web Push messages to their saved
// push_subscriptions.
//
// Deploy with: supabase functions deploy send-push --no-verify-jwt
// (--no-verify-jwt because the caller is Postgres, not a user
// session; instead this function checks the Authorization header
// against your own service role key — see 06_phase6_patches.sql)
//
// Required secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com)
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function resolveNotificationTargets(notif: any): Promise<string[]> {
  if (notif.target === "all") {
    const { data } = await admin.from("profiles").select("id").eq("institution_id", notif.institution_id);
    return (data || []).map((p: any) => p.id);
  }
  if (["teachers", "students", "parents"].includes(notif.target)) {
    const roleMap: Record<string, string> = { teachers: "teacher", students: "student", parents: "parent" };
    const { data } = await admin.from("profiles").select("id")
      .eq("institution_id", notif.institution_id).eq("role", roleMap[notif.target]);
    return (data || []).map((p: any) => p.id);
  }
  if (notif.target === "stage" && notif.target_stage_id) {
    return await studentsAndParentsFor("stage_id", notif.target_stage_id);
  }
  if (notif.target === "group" && notif.target_group_id) {
    return await studentsAndParentsFor("group_id", notif.target_group_id);
  }
  return [];
}

async function studentsAndParentsFor(column: string, value: string): Promise<string[]> {
  const { data: students } = await admin.from("students").select("profile_id").eq(column, value);
  const studentIds = (students || []).map((s: any) => s.profile_id);
  if (!studentIds.length) return [];
  const { data: parents } = await admin.from("parent_children").select("parent_profile_id").in("student_profile_id", studentIds);
  return [...studentIds, ...(parents || []).map((p: any) => p.parent_profile_id)];
}

Deno.serve(async (req) => {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (token !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let payload: { table?: string; record?: any };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
  }

  const { table, record } = payload;
  if (!table || !record) {
    return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400 });
  }

  let recipientIds: string[] = [];
  let title = "";
  let body = "";

  if (table === "notifications") {
    title = record.title || "";
    body = record.body || "";
    recipientIds = await resolveNotificationTargets(record);
    recipientIds = recipientIds.filter((id) => id !== record.sender_profile_id);
  } else if (table === "notes") {
    title = "پەیامی نوێ";
    body = record.message || "";
    if (record.to_admin) {
      const { data } = await admin.from("profiles").select("id")
        .eq("institution_id", record.institution_id).eq("role", "institution_admin");
      recipientIds = (data || []).map((p: any) => p.id);
    } else if (record.to_parent) {
      const { data } = await admin.from("parent_children").select("parent_profile_id")
        .eq("student_profile_id", record.student_profile_id);
      recipientIds = (data || []).map((p: any) => p.parent_profile_id);
    } else if (record.to_profile_id) {
      recipientIds = [record.to_profile_id];
    }
    recipientIds = recipientIds.filter((id) => id !== record.from_profile_id);
  } else if (table === "assessments") {
    title = "هەڵسەنگاندنی نوێ";
    body = "هەڵسەنگاندنێکی نوێ زیادکرا";
    const { data: parents } = await admin.from("parent_children").select("parent_profile_id")
      .eq("student_profile_id", record.student_profile_id);
    recipientIds = [record.student_profile_id, ...(parents || []).map((p: any) => p.parent_profile_id)];
  }

  recipientIds = [...new Set(recipientIds.filter(Boolean))];
  if (!recipientIds.length) {
    return new Response(JSON.stringify({ success: true, sent: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  const { data: subs } = await admin.from("push_subscriptions").select("*").in("profile_id", recipientIds);

  let sent = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify({ title, body })
      );
      sent++;
    } catch (err: any) {
      // Subscription is gone (uninstalled, expired) — clean it up.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }

  return new Response(JSON.stringify({ success: true, sent }), { headers: { "Content-Type": "application/json" } });
});
