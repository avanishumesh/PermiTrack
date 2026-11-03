import "server-only";
import { env } from "@/lib/env";

/**
 * Advisory AI helpers.
 *
 * IMPORTANT: AI output is never authoritative. `callEligibleMetaModel` only
 * produces suggestions for humans to read; it can never approve, reject,
 * withdraw, delegate or otherwise change a request. Every workflow mutation
 * goes through the SQL engine, which checks the signed-in user.
 */
export interface AiAdvice {
  advisory: true;
  source: "model" | "heuristic";
  summary: string;
  suggestions: string[];
}

interface ModelMessage {
  role: "system" | "user";
  content: string;
}

async function callModel(messages: ModelMessage[]): Promise<string | null> {
  if (!env.aiConfigured) return null;

  try {
    const response = await fetch(`${env.aiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.aiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.aiModel,
        temperature: 0.2,
        max_tokens: 400,
        messages,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

function toSuggestions(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter((line) => line.length > 0 && line.length < 400)
    .slice(0, 6);
}

/**
 * Single entry point for optional model assistance. Callers must treat the
 * result as advisory text only.
 */
export async function callEligibleMetaModel(
  task: string,
  context: Record<string, unknown>
): Promise<AiAdvice> {
  const raw = await callModel([
    {
      role: "system",
      content:
        "You are an advisory assistant for a university permission-management system. " +
        "You do not make decisions. Never state that a request is approved or rejected. " +
        "Return 2-5 short, concrete suggestions, one per line, no preamble.",
    },
    {
      role: "user",
      content: `Task: ${task}\nContext:\n${JSON.stringify(context).slice(0, 6000)}`,
    },
  ]);

  if (raw) {
    const suggestions = toSuggestions(raw);
    if (suggestions.length > 0) {
      return {
        advisory: true,
        source: "model",
        summary: "Advisory suggestions only — a human must review and decide.",
        suggestions,
      };
    }
  }

  return heuristicAdvice(task, context);
}

function heuristicAdvice(task: string, context: Record<string, unknown>): AiAdvice {
  const text = JSON.stringify(context).toLowerCase();
  const suggestions: string[] = [];

  if (task.includes("form") || task.includes("permission")) {
    suggestions.push("State the exact equipment or facility and the dates it is needed.");
    suggestions.push("Explain why the work cannot be done with standard teaching resources.");
    if (text.includes("hazard") || text.includes("chemical") || text.includes("laser")) {
      suggestions.push("Describe the hazard controls and required safety training.");
    }
    suggestions.push("Attach the safety certificate and supervisor support letter.");
  } else if (task.includes("query") || task.includes("answer")) {
    suggestions.push("Answer the specific question asked, with concrete dates or names.");
    suggestions.push("Point to the document that supports your answer.");
    suggestions.push("If something is still unknown, say so rather than guessing.");
  } else if (task.includes("document")) {
    suggestions.push("Check every required document is uploaded and current.");
    suggestions.push("Confirm the file is readable and contains the student's name.");
    suggestions.push("Replace outdated certificates instead of leaving both versions.");
  } else {
    suggestions.push("Add enough detail for an approver who does not know the project.");
    suggestions.push("Be explicit about dates, people and equipment.");
  }

  return {
    advisory: true,
    source: "heuristic",
    summary: "Offline checklist — AI is not configured or unavailable.",
    suggestions: suggestions.slice(0, 5),
  };
}

export async function suggestPermissionDetails(input: {
  permissionName?: string;
  description: string;
}) {
  return callEligibleMetaModel("suggest permission request details", input);
}

export async function assistQueryResponse(question: string, context: Record<string, unknown>) {
  return callEligibleMetaModel(`help answer the query: ${question}`, context);
}

export async function reviewDocumentChecklist(context: Record<string, unknown>) {
  return callEligibleMetaModel("review the document checklist for this request", context);
}
