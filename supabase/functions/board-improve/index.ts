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

const SYSTEM_PROMPT = `You are an expert mind-map editor. The user gives you the CURRENT state of a mind map. Restructure and ENRICH it into a clean, balanced 3-level tree.

RULES (mandatory):
- Level 1: EXACTLY ONE root node. parent = "".
- Level 2: 4 to 7 main themes. parent = root id.
- Level 3: 1 to 4 sub-ideas per main theme when relevant.
- Tree only: each non-root node has exactly one parent. No cycles.
- Keep the user's existing important ideas. You may rephrase short labels for clarity but keep meaning.
- Add NEW nodes ONLY when they meaningfully complete the topic (max ~6 new nodes).
- Keep the SAME language as the input.
- Labels: short. Root max 5 words. Level 2 max 5 words. Level 3 max 6 words.

OUTPUT:
Call extract_board with nodes_json: a JSON string of the full updated tree.`;

const TOOL = {
  type: "function",
  function: {
    name: "extract_board",
    description: "Return the improved 3-level board.",
    parameters: {
      type: "object",
      properties: {
        nodes_json: {
          type: "string",
          description:
            'JSON string of nodes array. Each: {"id":string,"label":string,"level":1|2|3,"parent":string}. Root parent is "".',
        },
      },
      required: ["nodes_json"],
      additionalProperties: false,
    },
  },
};

const sanitizeBoardInput = (raw: any): BoardNode[] => {
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

const sanitizeOutput = (rawNodes: unknown): BoardNode[] => {
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

  for (const n of raw.filter((x) => x.level === 2 && x.id !== rootId)) {
    if (idsSeen.has(n.id)) continue;
    cleaned.push({ ...n, parent: rootId });
    idsSeen.add(n.id);
  }
  const lvl2Ids = new Set(cleaned.filter((n) => n.level === 2).map((n) => n.id));

  for (const n of raw.filter((x) => x.level === 3 && x.id !== rootId)) {
    if (idsSeen.has(n.id)) continue;
    if (!n.parent || !lvl2Ids.has(n.parent)) continue;
    cleaned.push({ ...n, parent: n.parent });
    idsSeen.add(n.id);
  }
  return cleaned;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const board = sanitizeBoardInput(body?.board);
    if (!board.length) {
      return new Response(JSON.stringify({ error: "Empty board" }), {
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
            content:
              "CURRENT BOARD (JSON):\n" +
              JSON.stringify({ nodes: board }) +
              "\n\nPlease restructure & enrich. Call extract_board.",
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

    let nodesParsed: unknown;
    try {
      const args = JSON.parse(toolCall.function.arguments);
      nodesParsed = JSON.parse(args.nodes_json);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI output" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nodes = sanitizeOutput(nodesParsed);
    return new Response(JSON.stringify({ nodes }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("board-improve error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
