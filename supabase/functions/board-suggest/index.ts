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

const SYSTEM_PROMPT = `You are an expert mind-map analyst. The user gives you the CURRENT state of a mind map (nodes with id, label, level, parent). Produce a one-sentence summary, an optional warning if the board feels weak, and 4 to 10 high-quality suggestions split across four categories.

CATEGORIES (use exactly these strings):
- "missing_idea": a topic clearly missing from the board.
- "connection": a sub-idea that links two or bridges existing themes.
- "question": a thought-provoking question to deepen the subject.
- "resource": a concrete resource to add (book, article, tool, expert, framework).

For EACH suggestion provide:
- label: short text the user will see on the new node (max 7 words).
- why: ONE short sentence explaining why you recommend it (max 20 words).
- level: 2 for major themes, 3 for sub-ideas/questions/resources.
- parent_id: id of an EXISTING node it should attach to, or "" for none. Pick a parent whenever it makes sense — never invent a new id.

WARNING:
- If the board has < 3 main themes (level 2), or one branch heavily dominates, write a one-sentence warning. Otherwise empty string.

OUTPUT:
Call the tool board_suggest with summary, warning, suggestions_json (string).
Use the same language as the node labels.`;

const TOOL = {
  type: "function",
  function: {
    name: "board_suggest",
    description: "Return categorized suggestions to improve a mind map.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One-sentence summary of the board." },
        warning: { type: "string", description: "Optional warning, empty string if none." },
        suggestions_json: {
          type: "string",
          description:
            'JSON string of an array. Each item: {"category":"missing_idea|connection|question|resource","label":string,"why":string,"level":2|3,"parent_id":string}.',
        },
      },
      required: ["summary", "warning", "suggestions_json"],
      additionalProperties: false,
    },
  },
};

const sanitizeBoard = (raw: any): BoardNode[] => {
  if (!raw || !Array.isArray(raw.nodes)) return [];
  return raw.nodes
    .filter(
      (n: any) =>
        n &&
        typeof n.id === "string" &&
        typeof n.label === "string" &&
        (n.level === 1 || n.level === 2 || n.level === 3),
    )
    .map((n: any) => ({
      id: String(n.id),
      label: String(n.label).slice(0, 120),
      level: n.level,
      parent: typeof n.parent === "string" ? n.parent : null,
    }));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const board = sanitizeBoard(body?.board);
    if (!board.length) {
      return new Response(JSON.stringify({ error: "Empty board" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validIds = new Set(board.map((n) => n.id));
    const userPayload = JSON.stringify({ nodes: board });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              "CURRENT BOARD (JSON):\n" +
              userPayload +
              "\n\nPlease analyze and call board_suggest.",
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "board_suggest" } },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error", response.status, text);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded (429)." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted (402)." }), {
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
      return new Response(JSON.stringify({ error: "AI did not return structured output" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let args: any;
    let suggestionsRaw: any[] = [];
    try {
      args = JSON.parse(toolCall.function.arguments);
      if (typeof args.suggestions_json === "string") {
        suggestionsRaw = JSON.parse(args.suggestions_json);
      }
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI output" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowed = new Set(["missing_idea", "connection", "question", "resource"]);
    const suggestions = (Array.isArray(suggestionsRaw) ? suggestionsRaw : [])
      .filter((s: any) => s && allowed.has(s.category) && typeof s.label === "string")
      .map((s: any, i: number) => ({
        id: `sg-${Date.now()}-${i}`,
        category: s.category,
        label: String(s.label).trim().slice(0, 80),
        why: typeof s.why === "string" ? String(s.why).trim().slice(0, 160) : "",
        level: s.level === 2 ? 2 : 3,
        parent_id:
          typeof s.parent_id === "string" && validIds.has(s.parent_id) ? s.parent_id : null,
      }))
      .slice(0, 12);

    const summary = typeof args.summary === "string" ? args.summary.trim().slice(0, 220) : "";
    const warning =
      typeof args.warning === "string" && args.warning.trim().length
        ? args.warning.trim().slice(0, 220)
        : null;

    return new Response(
      JSON.stringify({ summary, warning, suggestions }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("board-suggest error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
