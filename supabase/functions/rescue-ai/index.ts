const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type IncidentInput = {
  title?: string;
  description?: string;
  location?: string;
  waterLevel?: number;
  affected?: number;
  trapped?: number;
  vulnerable?: string;
  medical?: string;
};

type Workspace = {
  incidents?: Array<{ title: string; severity: string; priority: number; status: string; trapped: number; affected: number; location: string }>;
  teams?: Array<{ name: string; status: string; equipment: string[]; city: string; response: string }>;
  resources?: Array<{ name: string; amount: number; unit: string }>;
};

type FeedSource = { name: string; status: string; detail: string };

type FireHotspot = { id: string; lat: number; lng: number; brightness?: number; confidence?: string | number; observedAt?: string; source: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function demoAnalysis(incident: IncidentInput) {
  const trapped = Number(incident.trapped || 0);
  const affected = Number(incident.affected || 0);
  const waterLevel = Number(incident.waterLevel || 0);
  const priority = Math.min(100, Math.max(20, 40 + trapped * 2 + Math.min(25, affected / 10) + waterLevel * 8));
  const severity = priority >= 80 || trapped >= 10 ? "Critical" : priority >= 60 ? "High" : priority >= 40 ? "Medium" : "Low";
  return {
    mode: "DEMO MODE", severity, priority: Math.round(priority),
    reasoning: `Demo assessment uses ${trapped} trapped people, ${affected} affected people, and ${waterLevel}m reported water. Missing details remain flagged for human verification.`,
    peopleAtRisk: Math.max(trapped, Math.round(affected * 0.35)),
    resources: ["Rescue boat", "Life jackets", trapped > 0 ? "Medical kit" : "Drinking water"],
    actions: ["Verify location and water depth", "Contact the closest available response team", "Keep a human controller in the approval loop"],
    teamType: trapped > 0 ? "Boat rescue team with medical support" : "Flood assessment and relief team",
    medicalUrgency: incident.medical || "Needs verification",
    responseUrgency: severity === "Critical" ? "Immediate" : severity === "High" ? "Within 30 minutes" : "Within 2 hours",
    nextAction: trapped > 0 ? "Review for immediate boat extraction" : "Request a field verification update",
  };
}

function demoAssistant(workspace: Workspace, question: string) {
  const incidents = workspace.incidents || [];
  const teams = workspace.teams || [];
  const resources = workspace.resources || [];
  const critical = [...incidents].sort((a, b) => b.priority - a.priority)[0];
  if (/critical|urgent|immediate|priority/i.test(question) && critical) return { mode: "DEMO MODE", answer: `${critical.title} at ${critical.location} is the highest-priority report at ${critical.priority}/100. It is ${critical.severity}, with ${critical.trapped} trapped and ${critical.affected} affected.` };
  if (/team|rescue|assign/i.test(question)) { const available = teams.filter((team) => team.status === "Available"); return { mode: "DEMO MODE", answer: available.length ? `${available[0].name} is currently available in ${available[0].city}. It carries ${available[0].equipment.join(", ")} and has an estimated ${available[0].response} response.` : "No rescue team is currently marked Available. A human controller should review standby units before assigning anyone." }; }
  if (/resource|supply|relief|water|food/i.test(question)) return { mode: "DEMO MODE", answer: resources.map((resource) => `${resource.name}: ${resource.amount} ${resource.unit}`).join(" · ") + ". Prioritize supplies for the highest-priority unresolved incident." };
  return { mode: "DEMO MODE", answer: `The workspace has ${incidents.filter((incident) => incident.status !== "Resolved").length} unresolved incidents and ${teams.filter((team) => team.status === "Available").length} available teams. Ask about a priority, team, or resource.` };
}

function parseFirmsCsv(csv: string): FireHotspot[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((header) => header.trim());
  const indexOf = (name: string) => headers.indexOf(name);
  return lines.slice(1).map((line, rowIndex) => {
    const values = line.split(",");
    const latitude = Number(values[indexOf("latitude")]);
    const longitude = Number(values[indexOf("longitude")]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const confidenceIndex = indexOf("confidence");
    const brightnessIndex = indexOf("bright_ti4");
    const dateIndex = indexOf("acq_date");
    const timeIndex = indexOf("acq_time");
    return {
      id: `firms-${values[dateIndex] || "unknown"}-${values[timeIndex] || rowIndex}-${latitude}-${longitude}`,
      lat: latitude,
      lng: longitude,
      brightness: brightnessIndex >= 0 ? Number(values[brightnessIndex]) : undefined,
      confidence: confidenceIndex >= 0 ? values[confidenceIndex] : undefined,
      observedAt: dateIndex >= 0 ? `${values[dateIndex]} ${values[timeIndex] || ""}`.trim() : undefined,
      source: "NASA FIRMS",
    };
  }).filter((hotspot): hotspot is FireHotspot => hotspot !== null);
}

async function checkSource(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function liveFeeds() {
  const sources: FeedSource[] = [];
  const messages: string[] = [];
  let fireHotspots: FireHotspot[] = [];
  const firmsKey = Deno.env.get("NASA_FIRMS_API_KEY") || Deno.env.get("NASA_FIRMS_MAP_KEY");
  if (!firmsKey) {
    sources.push({ name: "NASA FIRMS", status: "not_configured", detail: "A server-side FIRMS MAP_KEY is required before satellite detections can be requested." });
    messages.push("NASA FIRMS is waiting for a server-side MAP_KEY.");
  } else {
    try {
      const response = await fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/68,6,98,37/1`);
      if (!response.ok) throw new Error(`FIRMS request failed (${response.status})`);
      fireHotspots = parseFirmsCsv(await response.text());
      sources.push({ name: "NASA FIRMS", status: "connected", detail: `${fireHotspots.length} satellite detections returned for India.` });
    } catch (error) {
      sources.push({ name: "NASA FIRMS", status: "unavailable", detail: error instanceof Error ? error.message : "FIRMS could not be reached." });
      messages.push("NASA FIRMS did not return a usable response.");
    }
  }

  const [sachetOnline, imdOnline] = await Promise.all([
    checkSource("https://sachet.ndma.gov.in"),
    checkSource("https://api.imd.gov.in/public/api_reference.html"),
  ]);
  sources.push({ name: "NDMA SACHET", status: sachetOnline ? "portal_reachable" : "unavailable", detail: sachetOnline ? "Official alert portal is reachable. A machine-readable CAP/RSS feed is not exposed through this gateway." : "Official SACHET portal could not be reached." });
  sources.push({ name: "IMD", status: imdOnline ? "portal_reachable" : "unavailable", detail: imdOnline ? "Official API reference is reachable. No warning feed has been configured in this workspace." : "Official IMD API reference could not be reached." });
  if (sachetOnline || imdOnline) messages.push("Official warning portals are reachable, but no alert records were returned by a configured machine-readable feed.");
  const connected = sources.some((source) => source.status === "connected");
  const partial = sources.some((source) => source.status === "portal_reachable") || sources.some((source) => source.status === "unavailable");
  return { status: connected ? "connected" : partial ? "partial" : "offline", fireHotspots, weatherWarnings: [], sources, lastUpdated: new Date().toISOString(), messages };
}

async function callOpenRouter(messages: Array<{ role: string; content: unknown }>, model?: string) {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "HTTP-Referer": "https://rescuemesh.ai", "X-Title": "RescueMesh AI" },
    body: JSON.stringify({ model: model || Deno.env.get("OPENROUTER_MODEL") || "openai/gpt-4o-mini", messages, temperature: 0.2, response_format: { type: "json_object" } }),
  });
  if (!response.ok) throw new Error(`OpenRouter request failed (${response.status})`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter returned no usable response");
  return JSON.parse(content.replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const body = await request.json();
    if (body.action === "feeds") return json(await liveFeeds());
    if (body.action === "analyze") {
      const incident = body.incident as IncidentInput;
      const prompt = `You are a cautious emergency response analyst. Understand English or Tamil. Return only JSON with keys mode, severity, priority, reasoning, peopleAtRisk, resources, actions, teamType, medicalUrgency, responseUrgency, nextAction. Severity must be Critical, High, Medium, or Low. Priority must be 0-100. Never downgrade a life-threatening report because information is missing; clearly mark uncertainty. Report: ${JSON.stringify(incident)}`;
      const result = await callOpenRouter([{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(incident) }], body.model);
      return json(result ? { ...result, mode: "OPENROUTER" } : demoAnalysis(incident));
    }
    if (body.action === "assistant") {
      const workspace = body.workspace as Workspace;
      const question = typeof body.question === "string" ? body.question : "Summarize the response picture";
      const result = await callOpenRouter([{ role: "system", content: "You are RescueMesh AI Assistant. Use only the supplied workspace data. Return JSON with keys mode and answer. Be concise, mention uncertainty, and never claim to dispatch teams." }, { role: "user", content: `Workspace: ${JSON.stringify(workspace)}\nQuestion: ${question}` }], body.model);
      return json(result ? { ...result, mode: "OPENROUTER" } : demoAssistant(workspace, question));
    }
    if (body.action === "image") {
      const imageData = typeof body.imageData === "string" ? body.imageData : "";
      if (!imageData) return json({ error: "Image data is required" }, 400);
      const result = await callOpenRouter([{ role: "user", content: [{ type: "text", text: "Analyze this flood image. Return JSON with keys mode, summary, visibleWaterConditions, possibleRoadInundation, infrastructureDamage, hazards, uncertainty. Never claim exact water depth or identify trapped people from an image alone." }, { type: "image_url", image_url: { url: imageData } }] }], body.model);
      return json(result ? { ...result, mode: "OPENROUTER" } : { mode: "DEMO MODE", summary: "Image analysis is unavailable without the OpenRouter vision connection.", uncertainty: "A photograph cannot establish exact water depth or verify trapped people." });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "AI service unavailable" }, 500);
  }
});
