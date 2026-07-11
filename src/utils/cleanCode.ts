/**
 * Cleans markdown code blocks and shebang lines from model outputs.
 * This is shared across Orchestrator and ClaudeCodeAgent to avoid duplication.
 */
export function cleanCodeBlock(content: string): string {
  if (!content) return '';
  let cleaned = content;
  const match = content.match(/```(?:[a-zA-Z0-9_\-\.\+#]+)?\s*?\r?\n([\s\S]*?)```/);
  if (match && match[1] !== undefined) {
    cleaned = match[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  } else {
    const matchInline = content.match(/```([\s\S]*?)```/);
    if (matchInline && matchInline[1] !== undefined) {
      cleaned = matchInline[1].trim();
    }
  }
  // Strip out Linux/Unix shebang lines (#!) on Windows or general platforms
  cleaned = cleaned.replace(/^#![^\r\n]*\r?\n?/, '');
  return cleaned;
}
