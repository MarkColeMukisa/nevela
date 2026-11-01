/**
 * What is wrong with what has been typed into a json field, if anything: what Laravel will
 * refuse, said before the form is sent. Flare's own check takes anything JSON can write,
 * which `5` is, and its message is "Invalid input".
 */
export function jsonProblem(text: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "This isn't valid JSON.";
  }
  return typeof value === "object" && value !== null ? null : 'This has to be an object or a list, such as { "plan": "pro" }.';
}
