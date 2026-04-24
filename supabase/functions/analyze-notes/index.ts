const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type BoardNode = {
  id: string;
  label: string;
  level: 1 | 2 | 3;
  parent: string | null;
};

type BoardPayload = {
  nodes: BoardNode[];
};

const SYSTEM_PROMPT = `You are an expert at analyzing handwritten notes and turning them into a clean hierarchical mind map.

Your job: read the image, understand the underlying structure, and output a STRICT 3-level tree.

HIERARCHY RULES (MANDATORY):
- Level 1: EXACTLY ONE root node = the single main topic of the notes. parent = null.
- Level 2: 3 to 6 main ideas. Each has parent = root node id.
- Level 3: optional sub-ideas / details. Each has parent = a level-2 node id.
- A node at level 3 can NEVER have a level-1 parent.
- A node at level 2 can ONLY have the root as parent.
- The root has parent = null. No other node has parent = null.
- No orphans. Every non-root node MUST reference an existing parent id.
- Tree only — a node has exactly ONE parent. No cycles, no cross-links.

CONTENT RULES:
- The root label is a short title (max 5 words) summarizing the whole note.
- Level 2 labels are concise themes (max 5 words).
- Level 3 labels are short details (max 6 words).
- Keep the original handwritten language.
- Group related handwritten items under the same level-2 parent so children are coherent.
- Do NOT create a level-2 node that has no real connection to the main topic.
- If notes are sparse, it's fine to omit level 3 entirely.
- If image is unreadable: return one root node labeled "Notes illisibles" and nothing else.

OUTPUT:
- Call the tool extract_tree with { nodes: [...] }.
- Each node has: id (unique short string), label, level (1|2|3), parent (string id or null).
- Do NOT include positions — layout is computed automatically.
- Do NOT include edges — they are derived from parent.`;

const TOOL = {
  type: "function",
  function: {
    name: "extract_tree",
    description: "Return the handwritten notes as a strict 3-level hierarchical tree.",
    parameters: {
      type: "object",
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              level: { type: "number", enum: [1, 2, 3] },
              parent: { type: "string", nullable: true, description: "Parent node id, or empty string for the root" },
            },
            required: ["id", "label", "level", "parent"],
            additionalProperties: false,
          },
        },
      },
      required: ["nodes"],
      additionalProperties: false,
    },
  },
};

const sanitize = (input: unknown): BoardPayload => {
  if (!input || typeof input !== "object") throw new Error("Invalid AI payload");
  const c = input as { nodes?: Array<Record<string, unknown>> };
  if (!Array.isArray(c.nodes)) throw new Error("Missing nodes");

  // First pass: keep structurally valid nodes
  const raw = c.nodes
    .filter(
      (n) =>
        typeof n.id === "string" &&
        (n.id as string).length > 0 &&
        typeof n.label === "string" &&
        (n.label as string).trim().length > 0 &&
        (n.level === 1 || n.level === 2 || n.level === 3) &&
        (n.parent === null || typeof n.parent === "string"),
    )
    .map((n) => ({
      id: n.id as string,
      label: (n.label as string).trim(),
      level: n.level as 1 | 2 | 3,
      parent: (n.parent as string | null) ?? null,
    }));

  if (!raw.length) throw new Error("No valid nodes");

  // Find single root (level 1, parent null). If multiple, keep first; promote nothing else.
  const roots = raw.filter((n) => n.level === 1 && n.parent === null);
  let root = roots[0];
  if (!root) {
    // No root: synthesize one from the first level-2 candidate or first node
    const fallback = raw[0];
    root = { id: fallback.id, label: fallback.label, level: 1, parent: null };
  }

  // Force exactly one root
  const cleaned: BoardNode[] = [{ ...root, level: 1, parent: null }];
  const rootId = root.id;
  const idsSeen = new Set<string>([rootId]);

  // Level 2: parent must be root
  const lvl2 = raw.filter((n) => n.level === 2 && n.id !== rootId);
  for (const n of lvl2) {
    if (idsSeen.has(n.id)) continue;
    cleaned.push({ ...n, parent: rootId });
    idsSeen.add(n.id);
  }
  const lvl2Ids = new Set(cleaned.filter((n) => n.level === 2).map((n) => n.id));

  // Cap level 2 at 6
  if (lvl2Ids.size > 6) {
    const keep = [...lvl2Ids].slice(0, 6);
    const keepSet = new Set(keep);
    for (let i = cleaned.length - 1; i >= 0; i--) {
      if (cleaned[i].level === 2 && !keepSet.has(cleaned[i].id)) {
        idsSeen.delete(cleaned[i].id);
        cleaned.splice(i, 1);
      }
    }
    lvl2Ids.clear();
    keep.forEach((id) => lvl2Ids.add(id));
  }

  // Level 3: parent must be a valid level-2 id
  const lvl3 = raw.filter((n) => n.level === 3 && n.id !== rootId);
  for (const n of lvl3) {
    if (idsSeen.has(n.id)) continue;
    if (!n.parent || !lvl2Ids.has(n.parent)) continue; // drop orphans
    cleaned.push({ ...n, parent: n.parent });
    idsSeen.add(n.id);
  }

  return { nodes: cleaned };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { image } = await req.json();
    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "Invalid image payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze these handwritten notes and call extract_tree with a strict 3-level hierarchy." },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "extract_tree" } },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error", response.status, text);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded (429). Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted (402). Add credits to your Lovable workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `AI gateway error ${response.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await response.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call returned", JSON.stringify(json).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI did not return structured output" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI output" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const board = sanitize(parsed);

    return new Response(JSON.stringify(board), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-notes error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
