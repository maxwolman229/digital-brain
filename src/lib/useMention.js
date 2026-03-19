import { useState } from 'react'

/**
 * useMention — @-mention typeahead hook
 *
 * Usage:
 *   const inputRef = useRef(null)
 *   const { mentionQuery, handleMentionChange, insertMention, dismissMention }
 *     = useMention(value, setValue, inputRef)
 *
 * Render a <MentionDropdown> when mentionQuery !== null.
 */
export function useMention(value, setValue, inputRef) {
  const [mentionQuery, setMentionQuery] = useState(null)

  function handleMentionChange(e) {
    const newVal = e.target.value
    setValue(newVal)
    const cursor = e.target.selectionStart
    const textBefore = newVal.slice(0, cursor)
    const m = textBefore.match(/@(\w*)$/)
    setMentionQuery(m ? m[1] : null)
  }

  function insertMention(name) {
    const el = inputRef.current
    if (!el) return
    const cursor = el.selectionStart
    const textBefore = value.slice(0, cursor)
    const textAfter = value.slice(cursor)
    const atIdx = textBefore.lastIndexOf('@')
    const newVal = textBefore.slice(0, atIdx) + '@' + name + ' ' + textAfter
    setValue(newVal)
    setMentionQuery(null)
    setTimeout(() => {
      el.focus()
      const pos = atIdx + name.length + 2
      el.setSelectionRange(pos, pos)
    }, 0)
  }

  function dismissMention() {
    setMentionQuery(null)
  }

  return { mentionQuery, handleMentionChange, insertMention, dismissMention }
}
