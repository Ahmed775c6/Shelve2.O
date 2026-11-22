export function getAiText(value: unknown): string {
  if (typeof value !== "object" || value === null) throw new Error("The AI response was invalid.");
  if ("response" in value && typeof value.response === "string") return value.response.trim();
  if ("content" in value && typeof value.content === "string") return value.content.trim();
  throw new Error("The AI response was invalid.");
}
