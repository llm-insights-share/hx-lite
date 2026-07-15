import { buildHubCatalog } from "./hubCatalog.js";

export interface HubAdviceItem {
  title: string;
  why: string;
  next: string[];
}

export interface HubAdviceResult {
  topic: string;
  suggestions: HubAdviceItem[];
}

export function hubAdvice(hubRoot: string, topic = "general"): HubAdviceResult {
  const entries = buildHubCatalog(hubRoot);
  const has = (id: string) => entries.some((e) => e.id === id);
  const suggestions: HubAdviceItem[] = [];

  if (topic === "api" || topic === "general") {
    suggestions.push({
      title: has("api-conventions") ? "Use api-conventions" : "Publish api-conventions style skill",
      why: "API teams benefit from consistent contracts and error shapes.",
      next: ["hxhub search api --category package", "hxhub add api-conventions@1.0.0"]
    });
  }

  if (topic === "enterprise" || topic === "general") {
    suggestions.push({
      title: "Create project with enterprise profile",
      why: "Profile selects req/arch/dev/test stages and pulls related hub assets.",
      next: ["hxhub resolve --profile enterprise", "hx project create --profile enterprise --hub <hub>"]
    });
  }

  suggestions.push({
    title: "Pair skill/template/rubric assets",
    why: "Best delivery quality comes from guide + template + review rubric triad.",
    next: ["hxhub asset create", "hxhub doctor --fix-hints"]
  });

  return { topic, suggestions };
}
