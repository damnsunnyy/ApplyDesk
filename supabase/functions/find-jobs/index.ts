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

  // Himalayas supports country filters for remote roles. Map common city names
  // to country eligibility; unknown locations still search worldwide remote jobs.
  const normalizedLocation = location.toLowerCase();
  const countryMap: Record<string, string> = {
    india: "IN", in: "IN", pune: "IN", mumbai: "IN", bengaluru: "IN", bangalore: "IN", delhi: "IN", hyderabad: "IN", chennai: "IN",
    usa: "US", "united states": "US", us: "US", uk: "GB", "united kingdom": "GB", canada: "CA", australia: "AU", germany: "DE", france: "FR", singapore: "SG",
  };
  const country = Object.entries(countryMap).find(([name]) => normalizedLocation === name || normalizedLocation.endsWith(`, ${name}`))?.[1];
  const query = new URLSearchParams({ q: role, sort: "recent", page: "1" });
  if (country) query.set("country", country);
  try {
    const response = await fetch(`https://himalayas.app/jobs/api/search?${query}`);
    if (!response.ok) return json({ error: `Job provider returned ${response.status}. Try again later.` }, 502);
    const result = await response.json();
    const jobs = (Array.isArray(result.jobs) ? result.jobs : []).map((job: Record<string, unknown>) => {
      const restrictions = Array.isArray(job.locationRestrictions) ? job.locationRestrictions as string[] : [];
      const locationLabel = restrictions.length ? `Remote · ${restrictions.join(", ")}` : "Remote · worldwide";
      const description = String(job.description ?? job.excerpt ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
      const url = String(job.applicationLink ?? job.guid ?? "");
      return {
      provider_job_id: String(job.guid ?? url),
      title: String(job.title ?? "").slice(0, 180),
      company: String(job.companyName ?? "Company not listed").slice(0, 140),
      location: locationLabel.slice(0, 120),
      url: url.startsWith("https://") ? url : "",
      description: description.slice(0, 12000),
      created_at: typeof job.pubDate === "number" ? new Date(job.pubDate * 1000).toISOString() : "",
      salary_min: typeof job.minSalary === "number" ? job.minSalary : null,
      salary_max: typeof job.maxSalary === "number" ? job.maxSalary : null,
      source: "Himalayas",
      source_url: "https://himalayas.app/",
    };
    });
    return json({ jobs, source: "Himalayas", source_url: "https://himalayas.app/", remote_only: true });
  } catch {
    return json({ error: "Could not reach the job provider. Check the server function and try again." }, 502);
  }
});
