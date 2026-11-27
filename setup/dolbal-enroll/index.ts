// New accounts authenticate through Supabase Auth. A separate membership approval protects all club data.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers: cors });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply(405, {error:"method"});
  try {
    if (!req.headers.get("content-type")?.includes("application/json")) return reply(415, {error:"format"});
    const text = await req.text();
    if (text.length > 1024) return reply(413, {error:"size"});
    const {handle, password} = JSON.parse(text);
    if (typeof handle !== "string" || !/^[a-z0-9_]{3,24}$/.test(handle) || typeof password !== "string" ||
        password.length < 12 || new TextEncoder().encode(password).length > 72) return reply(400, {error:"invalid_input"});
    const url=Deno.env.get("SUPABASE_URL")!, key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers={apikey:key, Authorization:"Bearer "+key, "Content-Type":"application/json"};
    const limit=await fetch(url+"/rest/v1/rpc/dolbal_allow_signup",{method:"POST",headers,body:"{}"});
    if(!limit.ok) return reply(503,{error:"unavailable"});
    if(await limit.json() !== true) return reply(429,{error:"try_later"});
    const account=await fetch(url+"/auth/v1/admin/users",{method:"POST",headers,body:JSON.stringify({
      email:handle+"@members.dolbal.invalid",password,email_confirm:true
    })});
    if(!account.ok) return reply(account.status>=500?503:409,{error:"cannot_register"});
    return reply(201,{registered:true});
  } catch { return reply(400, {error:"invalid_request"}); }
});
