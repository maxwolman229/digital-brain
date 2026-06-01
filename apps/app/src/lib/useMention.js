import { useState, useCallback } from 'react'
import { encodeMention } from './mentions.js'

/**
 * useMention — @-mention typeahead hook with keyboard navigation.
 *
 * Usage:
 *   const inputRef = useRef(null)
 *   const mention = useMention(value, setValue, inputRef, members)
 *
 *   <textarea
 *     ref={inputRef}
 *     value={value}
 *     onChange={mention.handleChange}
 *     onKeyDown={mention.handleKeyDown}
 *   />
 *   {mention.query !== null && (
 *     <MentionDropdown
 *       query={mention.query}
 *       members={mention.filtered}
 *       activeIndex={mention.activeIndex}
 *       onSelect={mention.insert}
 *     />
 *   )}
 *
 * Mentions are inserted as tokens: @[Display Name](user-uuid)
 * The visible @ prefix stays, but the stored form carries the user_id.
 */

const MAX_RESULTS = 5
// Match @ followed by any characters that are not @ or newline, after word
// boundary (start of string or whitespace). Supports multi-word names.
// We look back to find the trigger @ and capture everything after it until cursor.
function detectMentionAtCursor(text, cursor) {
  // Walk backwards from cursor to find an @ that starts a valid mention prefix
  const before = text.slice(0, cursor)
  // Find the last @ that's preceded by whitespace/start
  const atIdx = before.search(/(^|\s)@[^@\s\n]*$/)
  if (atIdx === -1) return null
  // If the match started at position 0, the @ is at position 0; otherwise
  // the @ is one past the whitespace.
  const atPos = atIdx === 0 && before.startsWith('@') ? 0 : atIdx + 1
  const query = before.slice(atPos + 1) // text after @
  // Sanity: query shouldn't contain newlines or another @
  if (/[\n@]/.test(query)) return null
  return { atPos, query }
}

export function useMention(value, setValue, inputRef, members = []) {
  const [query, setQuery] = useState(null)      // current filter string after @
  const [atPos, setAtPos] = useState(-1)        // index of the triggering @
  const [activeIndex, setActiveIndex] = useState(0)

  // Filter members by case-insensitive substring match on displayName
  const filtered = query === null
    ? []
    : members
        .filter(m => m?.displayName?.toLowerCase().includes(query.toLowerCase()))
        .slice(0, MAX_RESULTS)

  const dismiss = useCallback(() => {
    setQuery(null)
    setAtPos(-1)
    setActiveIndex(0)
  }, [])

  const handleChange = useCallback((e) => {
    const newVal = e.target.value
    setValue(newVal)
    const cursor = e.target.selectionStart
    const detected = detectMentionAtCursor(newVal, cursor)
    if (detected) {
      setQuery(detected.query)
      setAtPos(detected.atPos)
      setActiveIndex(0)
    } else {
      setQuery(null)
      setAtPos(-1)
    }
  }, [setValue])

  const insert = useCallback((member) => {
    if (!member || atPos < 0) return
    const el = inputRef.current
    if (!el) return
    const cursor = el.selectionStart ?? value.length
    // Replace from @ up to current cursor with the encoded token + trailing space
    const token = encodeMention(member.displayName, member.userId)
    const newVal = value.slice(0, atPos) + token + ' ' + value.slice(cursor)
    setValue(newVal)
    dismiss()
    // Restore cursor after the inserted mention + trailing space
    const newCursor = atPos + token.length + 1
    setTimeout(() => {
      el.focus()
      try { el.setSelectionRange(newCursor, newCursor) } catch {}
    }, 0)
  }, [atPos, value, setValue, inputRef, dismiss])

  const handleKeyDown = useCallback((e) => {
    if (query === null || filtered.length === 0) {
      // Let Escape dismiss even when no matches
      if (query !== null && e.key === 'Escape') {
        e.preventDefault()
        dismiss()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insert(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      dismiss()
    }
  }, [query, filtered, activeIndex, insert, dismiss])

  return {
    query,
    filtered,
    activeIndex,
    handleChange,
    handleKeyDown,
    insert,
    dismiss,
    // Legacy aliases kept for any straggler callers during migration
    mentionQuery: query,
    handleMentionChange: handleChange,
    insertMention: insert,
    dismissMention: dismiss,
  }
}
