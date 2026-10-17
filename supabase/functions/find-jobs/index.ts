import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "POST required." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in to search jobs." }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Backend auth is not configured." }, 503);
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json({ error: "Your session expired. Sign in again." }, 401);

  const appId = Deno.env.get("ADZUNA_APP_ID");
  const appKey = Deno.env.get("ADZUNA_APP_KEY");
  if (!appId || !appKey) return json({ error: "Live search is not connected yet. Add the Adzuna API secrets in the setup guide." }, 503);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return json({ error: "Server-side rate limiting is not configured." }, 503);

  let body: { role?: unknown; location?: unknown };
  try { body = await request.json(); } catch { return json({ error: "Send a role and location." }, 400); }
  const role = typeof body.role === "string" ? body.role.trim().slice(0, 90) : "";
  const location = typeof body.location === "string" ? body.location.trim().slice(0, 100) : "";
  if (!role || !location) return json({ error: "Add both a role and a location." }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  await admin.from("job_search_log").delete().lt("requested_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error: countError } = await admin.from("job_search_log").select("id", { count: "exact", head: true }).eq("user_id", authData.user.id).gte("requested_at", since);
  if (countError) return json({ error: "Could not check the search limit." }, 503);
  if ((count ?? 0) >= 8) return json({ error: "Search limit reached. Please wait one minute and try again." }, 429);
  const { error: logError } = await admin.from("job_search_log").insert({ user_id: authData.user.id });
  if (logError) return json({ error: "Could not record this search." }, 503);

  const query = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "20",
    what: role,
    where: location,
    "content-type": "application/json",
  });
  try {
    const response = await fetch(`https://api.adzuna.com/v1/api/jobs/in/search/1?${query}`);
    if (!response.ok) return json({ error: `Job provider returned ${response.status}. Try again later.` }, 502);
    const result = await response.json();
    const jobs = (Array.isArray(result.results) ? result.results : []).map((job: Record<string, unknown>) => ({
      provider_job_id: String(job.id ?? ""),
      title: String(job.title ?? "").slice(0, 180),
      company: String((job.company as Record<string, unknown> | undefined)?.display_name ?? "Company not listed").slice(0, 140),
      location: String((job.location as Record<string, unknown> | undefined)?.display_name ?? location).slice(0, 120),
      url: String(job.redirect_url ?? ""),
      description: String(job.description ?? "").slice(0, 12000),
      created_at: String(job.created ?? ""),
      salary_min: typeof job.salary_min === "number" ? job.salary_min : null,
      salary_max: typeof job.salary_max === "number" ? job.salary_max : null,
    }));
    return json({ jobs });
  } catch {
    return json({ error: "Could not reach the job provider. Check the server function and try again." }, 502);
  }
});
