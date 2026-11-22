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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function demoAnalysis(incident: IncidentInput) {
  const trapped = Number(incident.trapped || 0);
  const affected = Number(incident.affected || 0);
  const waterLevel = Number(incident.waterLevel || 0);
  const priority = Math.min(100, Math.max(20, 40 + trapped * 2 + Math.min(25, affected / 10) + waterLevel * 8));
  const severity = priority >= 80 || trapped >= 10 ? "Critical" : priority >= 60 ? "High" : priority >= 40 ? "Medium" : "Low";
  return {
    mode: "DEMO MODE",
    severity,
    priority: Math.round(priority),
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

async function callGemini(prompt: string) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Gemini returned no usable response");
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const body = await request.json();
    if (body.action === "analyze") {
      const incident = body.incident as IncidentInput;
      const prompt = `You are a cautious emergency response analyst. Analyze this flood report and return only JSON with keys mode, severity, priority, reasoning, peopleAtRisk, resources, actions, teamType, medicalUrgency, responseUrgency, nextAction. Severity must be Critical, High, Medium, or Low. Priority must be 0-100. Never downgrade a life-threatening report because information is missing; clearly mark uncertainty. Report: ${JSON.stringify(incident)}`;
      const result = await callGemini(prompt);
      return json(result ? { ...result, mode: "GEMINI" } : demoAnalysis(incident));
    }
    if (body.action === "assistant") {
      const workspace = body.workspace as Workspace;
      const question = typeof body.question === "string" ? body.question : "Summarize the response picture";
      const result = await callGemini(`You are RescueMesh AI Assistant. Use only the supplied workspace data. Answer the question concisely, mention uncertainty, and do not claim to dispatch teams. Return JSON with keys mode and answer. Workspace: ${JSON.stringify(workspace)} Question: ${question}`);
      return json(result ? { ...result, mode: "GEMINI" } : demoAssistant(workspace, question));
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "AI service unavailable" }, 500);
  }
});
