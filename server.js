
import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 3001);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));

// Groq AI connection
const groq = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1"
    })
  : null;

// Supabase backend connection
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SECRET_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      )
    : null;

const systemPrompt = `You are Manish AI, a friendly, intelligent, helpful assistant.
Explain ideas clearly and step by step.
Support English and Tamil; reply in the language the user uses.
For student questions, teach concepts and reasoning.
Be honest when uncertain.
Never claim to have performed actions you have not performed.
Keep answers age-appropriate and respectful.
Use saved user memories only when relevant.
Never ask users to save sensitive personal information.`;

// Verify the user's Supabase login token
async function requireUser(req, res, next) {
  try {
    if (!supabase) {
      return res.status(503).json({
        error: "Supabase is not configured."
      });
    }

    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!token) {
      console.error("Authentication failed: No bearer token received.");
      return res.status(401).json({
        error: "Please sign in first."
      });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      console.error(
        "Token validation failed:",
        error?.message || "No user returned by Supabase"
      );

      return res.status(401).json({
        error: "Your login session is invalid. Please sign in again."
      });
    }

    req.user = data.user;
    next();
  } catch (error) {
    console.error("Authentication error:", error?.message || error);

    return res.status(401).json({
      error: "Authentication failed."
    });
  }
}

// Backend health check
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    groqConfigured: Boolean(groq),
    supabaseConfigured: Boolean(supabase)
  });
});

// Retrieve signed-in user's memories
app.get("/api/memories", requireUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_memories")
      .select("id, memory_key, memory_value, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    res.json({ memories: data || [] });
  } catch (error) {
    console.error("Memory retrieval failed:", error.message);
    res.status(500).json({ error: "Could not retrieve memories." });
  }
});

// Save a memory
app.post("/api/memories", requireUser, async (req, res) => {
  try {
    const { memory_key, memory_value } = req.body || {};

    if (
      typeof memory_key !== "string" ||
      typeof memory_value !== "string" ||
      !/^[a-zA-Z0-9_-]{1,50}$/.test(memory_key) ||
      !memory_value.trim() ||
      memory_value.length > 500
    ) {
      return res.status(400).json({
        error: "Please provide a valid memory name and value."
      });
    }

    const { data, error } = await supabase
      .from("user_memories")
      .upsert(
        {
          user_id: req.user.id,
          memory_key,
          memory_value: memory_value.trim(),
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,memory_key" }
      )
      .select("id, memory_key, memory_value")
      .single();

    if (error) throw error;
    res.json({ success: true, memory: data });
  } catch (error) {
    console.error("Memory save failed:", error.message);
    res.status(500).json({ error: "Could not save this memory." });
  }
});

// Delete a memory
app.delete("/api/memories/:id", requireUser, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid memory ID." });
    }

    const { error } = await supabase
      .from("user_memories")
      .delete()
      .eq("id", id)
      .eq("user_id", req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("Memory deletion failed:", error.message);
    res.status(500).json({ error: "Could not delete this memory." });
  }
});

// Authenticated AI chat
app.post("/api/chat", requireUser, async (req, res) => {
  try {
    if (!groq) {
      return res.status(503).json({
        error: "Groq API is not configured."
      });
    }

    const messages = req.body?.messages;

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 40
    ) {
      return res.status(400).json({
        error: "Please send a valid chat conversation."
      });
    }

    const safeMessages = messages.map((m) => {
      if (
        !m ||
        !["user", "assistant"].includes(m.role) ||
        typeof m.content !== "string"
      ) {
        throw new Error("Invalid message format.");
      }

      return {
        role: m.role,
        content: m.content.slice(0, 12000)
      };
    });

    const { data: memories, error: memoryError } = await supabase
      .from("user_memories")
      .select("memory_key, memory_value")
      .eq("user_id", req.user.id)
      .limit(30);

    if (memoryError) throw memoryError;

    const name =
      req.user.user_metadata?.full_name ||
      req.user.user_metadata?.name ||
      "";

    const memoryText = (memories || [])
      .map((m) => `${m.memory_key}: ${m.memory_value}`)
      .join("\n");

    const personalizedPrompt = `
${systemPrompt}

${name ? `The user's preferred name is ${name}.` : ""}

${memoryText ? `User-approved memories:\n${memoryText}` : ""}
`;

    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: personalizedPrompt },
        ...safeMessages
      ],
      temperature: 0.7
    });

    res.json({
      reply:
        response.choices?.[0]?.message?.content ||
        "I couldn't create a reply. Please try again."
    });
  } catch (error) {
    console.error("Chat request failed:", error?.message || error);

    const status =
      error?.status && Number.isInteger(error.status)
        ? error.status
        : 500;

    res.status(status).json({
      error:
        status === 401
          ? "Authentication failed. Please sign in again."
          : "Manish had trouble answering. Please try again."
    });
  }
});

// Serve the built frontend
app.use(express.static(distPath));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API route not found." });
  }

  res.sendFile(path.join(distPath, "index.html"), (error) => {
    if (error) next(error);
  });
});

// Start server
app.listen(port, () => {
  console.log(`Manish AI listening on port ${port}`);
});
