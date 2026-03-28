import OpenAI from "openai";
import fs from "fs";

// ✅ Load KB safely (NO import / NO assert / NO with)
const kb = JSON.parse(
  fs.readFileSync(
    new URL("../kb-embeddings.json", import.meta.url),
    "utf-8"
  )
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  try {
    // Only allow POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST method only" });
    }

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Simple KB search (basic fallback logic)
    const relevantDocs = kb.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(message.toLowerCase())
    );

    const context = relevantDocs
      .slice(0, 3)
      .map((doc) => doc.text || JSON.stringify(doc))
      .join("\n");

    // OpenAI response
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful AI assistant. Use the provided context if relevant.",
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nUser: ${message}`,
        },
      ],
    });

    const reply = completion.choices[0].message.content;

    return res.status(200).json({
      reply,
      articles: relevantDocs.slice(0, 3),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error",
      details: error.message,
    });
  }
}
