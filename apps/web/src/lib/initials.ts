/** One or two initials: the first character of a CJK name, else word initials. */
export function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/[㐀-鿿]/.test(trimmed[0]!)) return trimmed[0]!;
  return trimmed
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
