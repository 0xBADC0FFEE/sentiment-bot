export function normalizeTgUsername(input: string): string | null {
  if (!input.startsWith("@")) return null
  const body = input.slice(1).toLowerCase()
  return body.length ? body : null
}
