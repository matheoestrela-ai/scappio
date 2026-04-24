// Analyze handwritten notes via Lovable AI Vision (Gemini)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert at analyzing handwritten notes, sketches, mind maps and flowcharts.
Given an image, extract a real diagram (not a list) as a JSON object using the provided tool.

Rules:
- Identify each distinct idea, title, sub-idea, decision or note as one entry in "ideas".
- Assign a "shape" to each idea based on its role:
  * "rectangle" — main ideas, titles, key concepts, processes (default)
  * "circle" — sub-ideas, supporting details, small notes, start/end points
  * "diamond" — decision points, questions, branches (anything with "?", "if", "or", choices)
- Assign a "role": "main" (central topics), "sub" (children/details), or "decision".
- Detect arrows, lines, or visual connections between ideas — list them in "connections".
  Every non-trivial idea should be connected to at least one other idea so the result reads like a real diagram.
- Detect priorities from cues like stars, exclamation marks, underlines, "!!", "TODO", or red/highlighted items.
- Group ideas by category when categories are visible.
- Use short, clear titles (max 6 words). Put extra context in "detail".
- Always return at least 1 idea. If the image is unreadable, return one idea explaining that.
- IDs must be short, unique slugs like "idea-1", "idea-2".
- Connection "from" and "to" must reference existing idea IDs.
- Translate handwriting as-is (keep the original language).`;

const TOOL = {
  type: "function",
  function: {
    name: "extract_board",
    description: "Return the structured board extracted from the handwritten notes.",
    parameters: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              detail: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
              category: { type: "string" },
              shape: { type: "string", enum: ["rectangle", "circle", "diamond"] },
              role: { type: "string", enum: ["main", "sub", "decision"] },
            },
            required: ["id", "title", "shape"],
            additionalProperties: false,
          },
        },
        connections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              label: { type: "string" },
            },
            required: ["from", "to"],
            additionalProperties: false,
          },
        },
      },
      required: ["ideas", "connections"],
      additionalProperties: false,
    },
  },
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
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to parse AI output" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
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
