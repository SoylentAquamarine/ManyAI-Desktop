export interface AttachedFile {
  path: string
  tmpPath: string
  name: string
  content: string
}

export function extractCode(text: string): string {
  const match = text.match(/```(?:\w+)?\n?([\s\S]*?)```/)
  return match ? match[1].trimEnd() : text
}

export function hasCodeBlock(text: string): boolean {
  return /```[\s\S]*?```/.test(text)
}

export function buildFilePrompt(userText: string, file: AttachedFile): string {
  return `Here is my current script (\`${file.name}\`):\n\`\`\`\n${file.content}\n\`\`\`\n\n${userText}`
}

export async function openFile(): Promise<AttachedFile | null | { error: string }> {
  const result = await window.api.openFile()
  if ('error' in result) return result.error === 'Cancelled' ? null : { error: result.error }
  const tmpPath = result.path + '.tmp'
  return { path: result.path, tmpPath, name: result.name, content: result.content }
}

export async function updateTmpFile(
  file: AttachedFile,
  code: string,
): Promise<{ ok: true; updatedFile: AttachedFile } | { error: string }> {
  const result = await window.api.writeFileDirect(file.tmpPath, code)
  if ('ok' in result) return { ok: true, updatedFile: { ...file, content: code } }
  return { error: result.error }
}
