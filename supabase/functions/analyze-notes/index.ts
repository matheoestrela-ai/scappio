const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type BoardShape = "rectangle" | "circle" | "diamond";

type BoardNode = {
  id: string;
  label: string;
  shape: BoardShape;
  position: {
    x: number;
    y: number;
  };
};

type BoardEdge = {
  source: string;
  target: string;
  label?: string;
};

type BoardPayload = {
  nodes: BoardNode[];
  edges: BoardEdge[];
};

const SYSTEM_PROMPT = `You analyze handwritten notes and convert them into a strict diagram JSON.

Return a real board, not prose and not a list.

You MUST call the provided tool with this exact structure:
- nodes: array of objects with id, label, shape, position { x, y }
- edges: array of objects with source, target, optional label

Rules:
- Every node must become a visible diagram element.
- Shapes:
  * rectangle = idea, topic, process, action, heading
  * circle = concept, detail, supporting point, start/end
  * diamond = decision, question, branch, yes/no split
- Use short labels, max 6 words.
- Positions must be explicit numeric coordinates.
- Spread nodes so they do not overlap.
- Use a readable left-to-right or top-to-bottom flow.
- Connect related nodes with edges so the diagram is coherent.
- source and target must reference valid node ids.
- Keep the handwritten language as-is.
- If the image is unreadable, return one rectangle node labeled accordingly and no edges.
- Never include markdown, comments, or extra keys.`;

const TOOL = {
  type: "function",
  function: {
    name: "extract_board",
    description: "Return the handwritten notes as strict board JSON for React Flow.",
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
              shape: { type: "string", enum: ["rectangle", "circle", "diamond"] },
              position: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                },
                required: ["x", "y"],
                additionalProperties: false,
              },
            },
            required: ["id", "label", "shape", "position"],
            additionalProperties: false,
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source: { type: "string" },
              target: { type: "string" },
              label: { type: "string" },
            },
            required: ["source", "target"],
            additionalProperties: false,
          },
        },
      },
      required: ["nodes", "edges"],
      additionalProperties: false,
    },
  },
};

const isShape = (value: unknown): value is BoardShape =>
  value === "rectangle" || value === "circle" || value === "diamond";

const sanitizeBoardPayload = (input: unknown): BoardPayload => {
  if (!input || typeof input !== "object") {
    throw new Error("AI returned an invalid board payload");
  }

  const candidate = input as {
    nodes?: Array<Record<string, unknown>>;
    edges?: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
    throw new Error("AI response is missing nodes or edges");
  }

  const nodes = candidate.nodes
    .filter((node) => {
      const position = node.position as { x?: unknown; y?: unknown } | undefined;
      return (
        typeof node.id === "string" &&
        typeof node.label === "string" &&
        isShape(node.shape) &&
        !!position &&
        typeof position.x === "number" &&
        typeof position.y === "number"
      );
    })
    .map((node) => ({
      id: node.id as string,
      label: (node.label as string).trim(),
      shape: node.shape as BoardShape,
      position: {
        x: Math.round((node.position as { x: number; y: number }).x),
        y: Math.round((node.position as { x: number; y: number }).y),
      },
    }))
    .filter((node) => node.id.length > 0 && node.label.length > 0);

  if (!nodes.length) {
    throw new Error("AI did not return any valid nodes");
  }

  const ids = new Set(nodes.map((node) => node.id));

  const edges = candidate.edges
    .filter(
      (edge) =>
        typeof edge.source === "string" &&
        typeof edge.target === "string" &&
        ids.has(edge.source) &&
        ids.has(edge.target) &&
        (typeof edge.label === "string" || typeof edge.label === "undefined"),
    )
    .map((edge) => ({
      source: edge.source as string,
      target: edge.target as string,
      ...(typeof edge.label === "string" && edge.label.trim().length > 0
        ? { label: edge.label.trim() }
        : {}),
    }));

  return { nodes, edges };
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
              { type: "text", text: "Analyze this image of handwritten notes and call extract_board." },
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

    const board = sanitizeBoardPayload(parsed);

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
