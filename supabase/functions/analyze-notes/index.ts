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

type Suggestion = {
  kind: "missing_idea" | "connection" | "question";
  label: string;
  level: 1 | 2 | 3;
};

type Insights = {
  summary: string;
  suggestions: Suggestion[];
  warning: string | null;
};

type AnalyzePayload = {
  nodes: BoardNode[];
  insights: Insights;
};

const SYSTEM_PROMPT = `You are an expert at analyzing handwritten notes and turning them into a clean hierarchical mind map AND a smart insights panel.

PHASE 1 — EXHAUSTIVE EXTRACTION
Read the image with extreme care. Do NOT skip anything.
- Capture every visible idea, keyword, arrow, bullet, and annotation, even if small or in the margins.
- Read every short word/phrase, even if poorly written. Keep the original handwritten language.
- Use arrows and visual proximity to infer parent/child relationships.
- Prefer including a node over dropping it. If unsure of the level, choose level 3.

PHASE 2 — STRICT 3-LEVEL TREE
- Level 1: EXACTLY ONE root node = the single main topic. parent = "" (empty string).
- Level 2: 3 to 8 main ideas. Each parent = root id.
- Level 3: optional sub-ideas / details. Each parent = a level-2 id.
- A level-3 node can NEVER have a level-1 parent.
- A level-2 node can ONLY have the root as parent.
- Tree only: one parent per node, no cycles, no cross-links.
- The root label is a short title (max 5 words) summarizing the whole note.
- Level 2 labels: concise themes (max 5 words).
- Level 3 labels: short details (max 6 words).
- If image is unreadable: one root node "Notes illisibles" and empty insights.

PHASE 3 — INSIGHTS
Then think about the topic and produce:
- summary: ONE sentence (max 25 words) describing what the board represents.
- suggestions: 3 to 6 items to enrich the board. Each is one of:
    • "missing_idea": a topic clearly missing from the board.
    • "connection": a sub-idea linking two existing themes.
    • "question": a thought-provoking question to deepen the subject.
  Each suggestion has a short label (max 6 words), in the same language as the notes, and a level (2 for major missing themes, 3 for sub-ideas/questions).
- warning: if the board feels incomplete, sparse, or unbalanced (e.g. < 3 level-2 ideas, or one branch much heavier than others), write a short friendly warning sentence in the notes' language. Otherwise null.

OUTPUT
Call the tool extract_board with:
- nodes_json: JSON string of the nodes array (id, label, level, parent="" for root).
- summary: string.
- suggestions_json: JSON string of suggestions array, each {kind, label, level}.
- warning: string or empty string if no warning.`;

const TOOL = {
  type: "function",
  function: {
    name: "extract_board",
    description:
      "Return the handwritten notes as a strict 3-level hierarchical tree plus smart insights.",
    parameters: {
      type: "object",
      properties: {
        nodes_json: {
          type: "string",
          description:
            'JSON string array of nodes. Each node: {"id":string,"label":string,"level":1|2|3,"parent":string}. Root parent is "".',
        },
        summary: {
          type: "string",
          description: "One-sentence summary of what the board represents.",
        },
        suggestions_json: {
          type: "string",
          description:
            'JSON string array. Each item: {"kind":"missing_idea"|"connection"|"question","label":string,"level":2|3}.',
        },
        warning: {
          type: "string",
          description:
            "Short friendly warning if the board seems incomplete or unbalanced. Empty string if none.",
        },
      },
      required: ["nodes_json", "summary", "suggestions_json", "warning"],
      additionalProperties: false,
    },
  },
};

const sanitizeNodes = (rawNodes: unknown): BoardNode[] => {
  if (!Array.isArray(rawNodes)) throw new Error("Missing nodes");

  const raw = rawNodes
    .filter(
      (n: any) =>
        n &&
        typeof n.id === "string" &&
        n.id.length > 0 &&
        typeof n.label === "string" &&
        n.label.trim().length > 0 &&
        (n.level === 1 || n.level === 2 || n.level === 3),
    )
    .map((n: any) => {
      const p = n.parent;
      const parent = typeof p === "string" && p.length > 0 ? p : null;
      return {
        id: n.id as string,
        label: (n.label as string).trim(),
        level: n.level as 1 | 2 | 3,
        parent,
      };
    });

  if (!raw.length) throw new Error("No valid nodes");

  const roots = raw.filter((n) => n.level === 1 && n.parent === null);
  let root = roots[0];
  if (!root) {
    const fallback = raw[0];
    root = { id: fallback.id, label: fallback.label, level: 1, parent: null };
  }

  const cleaned: BoardNode[] = [{ ...root, level: 1, parent: null }];
  const rootId = root.id;
  const idsSeen = new Set<string>([rootId]);

  const lvl2 = raw.filter((n) => n.level === 2 && n.id !== rootId);
  for (const n of lvl2) {
    if (idsSeen.has(n.id)) continue;
    cleaned.push({ ...n, parent: rootId });
    idsSeen.add(n.id);
  }
  const lvl2Ids = new Set(cleaned.filter((n) => n.level === 2).map((n) => n.id));

  if (lvl2Ids.size > 8) {
    const keep = [...lvl2Ids].slice(0, 8);
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

  const lvl3 = raw.filter((n) => n.level === 3 && n.id !== rootId);
  for (const n of lvl3) {
    if (idsSeen.has(n.id)) continue;
    if (!n.parent || !lvl2Ids.has(n.parent)) continue;
    cleaned.push({ ...n, parent: n.parent });
    idsSeen.add(n.id);
  }

  return cleaned;
};

const sanitizeSuggestions = (raw: unknown): Suggestion[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (s: any) =>
        s &&
        typeof s.label === "string" &&
        s.label.trim().length > 0 &&
        (s.kind === "missing_idea" || s.kind === "connection" || s.kind === "question"),
    )
    .map((s: any) => ({
      kind: s.kind,
      label: (s.label as string).trim().slice(0, 80),
      level: (s.level === 2 || s.level === 3 ? s.level : 3) as 2 | 3,
    }))
    .slice(0, 8);
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

    const mimeMatch = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = mimeMatch?.[1]?.toLowerCase() ?? "";
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(mimeType)) {
      return new Response(
        JSON.stringify({ error: "Unsupported image format. Please upload JPG or PNG." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
              {
                type: "text",
                text:
                  "Analyze these handwritten notes EXHAUSTIVELY. Capture every word, arrow and annotation. Then call extract_board with the strict 3-level hierarchy AND the insights (summary, suggestions, warning).",
              },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "extract_board" } },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error", response.status, text);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded (429). Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits exhausted (402). Add credits to your Lovable workspace.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const lowered = text.toLowerCase();
      if (lowered.includes("unable to process input image")) {
        return new Response(
          JSON.stringify({ error: "Unsupported image format. Please upload JPG or PNG." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
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

    let toolArgs: any;
    let nodesParsed: unknown;
    let suggestionsParsed: unknown = [];
    try {
      toolArgs = JSON.parse(toolCall.function.arguments);
      nodesParsed = JSON.parse(toolArgs.nodes_json);
      if (typeof toolArgs.suggestions_json === "string" && toolArgs.suggestions_json.trim().length) {
        try {
          suggestionsParsed = JSON.parse(toolArgs.suggestions_json);
        } catch {
          suggestionsParsed = [];
        }
      }
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI output" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nodes = sanitizeNodes(nodesParsed);
    const suggestions = sanitizeSuggestions(suggestionsParsed);
    const summary =
      typeof toolArgs.summary === "string" ? toolArgs.summary.trim().slice(0, 220) : "";
    const rawWarning =
      typeof toolArgs.warning === "string" ? toolArgs.warning.trim().slice(0, 220) : "";
    const warning = rawWarning.length > 0 ? rawWarning : null;

    const payload: AnalyzePayload = {
      nodes,
      insights: { summary, suggestions, warning },
    };

    return new Response(JSON.stringify(payload), {
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
