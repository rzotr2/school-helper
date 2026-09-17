// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestPayload {
  documentId?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured on the server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client for auth check using caller's JWT
    const supabaseUserClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: RequestPayload = await req.json().catch(() => ({}));
    const { documentId } = payload;
    if (!documentId) {
      return new Response(JSON.stringify({ error: "documentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client to securely fetch document content and update understanding
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: doc, error: docError } = await supabaseAdmin
      .from("documents")
      .select("id, owner_id, original_name, content")
      .eq("id", documentId)
      .maybeSingle();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (doc.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden: Not document owner" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deterministic text preparation from persisted content
    const content = doc.content as any;
    let preparedText = "";
    if (content && Array.isArray(content.pages)) {
      const parts: string[] = [];
      let totalLength = 0;
      for (const p of content.pages) {
        let pageText = "";
        if (Array.isArray(p.blocks) && p.blocks.length > 0) {
          pageText = p.blocks
            .map((b: any) => {
              if (b.type === "heading") return `## ${b.text}`;
              if (b.type === "list") return `- ${b.text}`;
              return b.text;
            })
            .join("\n\n");
        } else if (p.quality?.usable && p.nativeText) {
          pageText = p.nativeText;
        } else if (p.ocrText) {
          pageText = p.ocrText;
        } else {
          pageText = p.nativeText ?? "";
        }

        const trimmed = pageText.trim();
        if (!trimmed) continue;

        const section = `--- Seite ${p.pageNumber} ---\n${trimmed}\n\n`;
        if (totalLength + section.length > 50000) {
          parts.push("[Inhalt gekürzt]");
          break;
        }
        parts.push(section);
        totalLength += section.length;
      }
      preparedText = parts.join("").trim();
    }

    if (!preparedText) {
      return new Response(
        JSON.stringify({
          error: "Document has no extracted text to analyze",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an educational assistant analyzing a student's study document.
Analyze the provided document text and extract lightweight, clean semantic metadata.

You must respond ONLY with a valid JSON object adhering strictly to this schema:
{
  "title": string or null (max 100 chars, concise semantic title of the document, clean of file extensions),
  "documentType": "worksheet" | "script" | "summary" | "exam" | "presentation" | "notes" | "other",
  "subject": string or null (e.g. "Informatik", "Mathematik", "Geschichte", "Biologie", "Deutsch", "Englisch"),
  "summary": string (1 to 3 concise sentences summarizing what this document is about, max 350 chars),
  "keyTopics": string[] (3 to 8 key concepts, topics or vocabulary items covered in the document)
}

Important:
- Use the language of the document (predominantly German or Ukrainian or English).
- Do not output markdown code blocks or backticks, just the raw JSON object.
- Keep summary clear and informative for a student.`;

    const userPrompt = `Dateiname: ${doc.original_name}\n\nDokumententext:\n${preparedText}`;

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
        ],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", errText);
      return new Response(
        JSON.stringify({ error: `AI provider error: ${geminiResponse.statusText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return new Response(JSON.stringify({ error: "Empty response from AI provider" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(candidateText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON from AI provider" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side validation and normalization
    const documentType = ["worksheet", "script", "summary", "exam", "presentation", "notes"].includes(
      parsed.documentType
    )
      ? parsed.documentType
      : "other";

    const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 100) : null;
    const subject = typeof parsed.subject === "string" && parsed.subject.trim() ? parsed.subject.trim().slice(0, 80) : null;
    const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim().slice(0, 390) : "";
    const keyTopics = Array.isArray(parsed.keyTopics)
      ? Array.from(
          new Set(
            parsed.keyTopics
              .filter((t: any) => typeof t === "string" && t.trim())
              .map((t: string) => t.trim().slice(0, 60))
          )
        ).slice(0, 10)
      : [];

    const understanding = {
      title,
      documentType,
      subject,
      summary: summary || "Keine Zusammenfassung verfügbar.",
      keyTopics,
      analyzedAt: new Date().toISOString(),
    };

    // Persist directly to Supabase documents.understanding
    const { error: updateError } = await supabaseAdmin
      .from("documents")
      .update({ understanding })
      .eq("id", documentId);

    if (updateError) {
      console.error("Failed to update understanding in database:", updateError);
      return new Response(JSON.stringify({ error: "Database update failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, understanding }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Function exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
