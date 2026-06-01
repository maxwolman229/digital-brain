// Shared mention tokeniser.
// A mention is stored in text as: @[User Display Name](user-uuid)
// This pairs the name (for display if the user is later deleted) with a
// durable user_id reference.
//
// Examples:
//   Raw text:    "Great catch @[Marco Ferrari](550e8400-e29b-41d4-a716-446655440000) on this one"
//   Display:     "Great catch @Marco Ferrari on this one" (with @Marco Ferrari as blue link)
//
// Extracted ids: ['550e8400-e29b-41d4-a716-446655440000']

// Matches @[Name with spaces](uuid). The name captures anything except ']',
// and the uuid is lax — any hex/dash string.
const TOKEN_RE = /@\[([^\]]+)\]\(([0-9a-f-]{20,})\)/g

// Encode a mention into the stored token format.
export function encodeMention(displayName, userId) {
  if (!displayName || !userId) return ''
  return `@[${displayName}](${userId})`
}

// Parse text into segments: { type: 'text'|'mention', content, userId?, displayName? }
// Used by renderers to walk the text and emit <span> / <MentionPill />.
export function parseMentionText(text) {
  if (!text) return []
  const out = []
  let lastIndex = 0
  // Fresh regex per call so lastIndex doesn't leak between invocations
  const re = new RegExp(TOKEN_RE.source, 'g')
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push({ type: 'text', content: text.slice(lastIndex, m.index) })
    }
    out.push({ type: 'mention', displayName: m[1], userId: m[2] })
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    out.push({ type: 'text', content: text.slice(lastIndex) })
  }
  return out
}

// Extract all mentioned user IDs from text. Returns a de-duplicated array.
export function extractMentionedUserIds(text) {
  if (!text) return []
  const ids = new Set()
  const re = new RegExp(TOKEN_RE.source, 'g')
  let m
  while ((m = re.exec(text)) !== null) ids.add(m[2])
  return [...ids]
}

// Convert stored token text back to plain text (for notifications, previews, etc.).
// "@[Marco](uuid) said hi" → "@Marco said hi"
export function stripMentionTokens(text) {
  if (!text) return ''
  return text.replace(new RegExp(TOKEN_RE.source, 'g'), '@$1')
}
