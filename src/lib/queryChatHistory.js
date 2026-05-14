import { supabase } from './supabase.js'
import { getUserId } from './userContext.js'

// =============================================================================
// queryChatHistory — persistence for the Query interface chat thread.
//
// One row per message. Scoped (user_id, plant_id) — switching plants shows a
// different history, and each user only sees their own. RLS on the table
// enforces this server-side; the WHERE clauses below match it.
// =============================================================================

const HISTORY_LIMIT = 50           // load this many on mount
const CONTEXT_TURNS = 10           // send last N messages to the edge function

// ─── Row → UI message ─────────────────────────────────────────────────────────
//
// Rows arrive sorted DESC by created_at (newest first). The UI renders ASC
// (oldest at the top, newest at the bottom), so callers reverse before render.
function rowToMessage(row) {
  return {
    id: row.id,
    role: row.message_type === 'user_question' ? 'user' : 'assistant',
    text: row.message_text,
    sources: Array.isArray(row.citations) ? row.citations : [],
    time: row.created_at,
    persisted: true,
  }
}

// ─── Load most recent N messages for this user + plant ────────────────────────

export async function fetchChatHistory(plantId, { limit = HISTORY_LIMIT } = {}) {
  const userId = getUserId()
  if (!userId || !plantId) return []
  const { data, error } = await supabase
    .from('query_chat_history')
    .select('id, message_text, message_type, citations, created_at')
    .eq('user_id', userId)
    .eq('plant_id', plantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.warn('[queryChatHistory] fetch error:', error.message)
    return []
  }
  // Newest-first from DB → reverse to oldest-first for the chat thread.
  return (data || []).reverse().map(rowToMessage)
}

// ─── Save a single message ────────────────────────────────────────────────────
//
// Fire-and-forget. We don't read the inserted row back (no .select().single())
// because that would require a post-insert SELECT round-trip and add a second
// failure mode for no benefit — the caller doesn't need the row id.
// Errors are logged with full context so RLS / auth issues are visible.
export async function saveChatMessage({ plantId, role, text, citations = [] }) {
  const userId = getUserId()
  if (!userId || !plantId || !text) {
    console.warn('[queryChatHistory] save skipped — missing context', {
      hasUserId: !!userId, hasPlantId: !!plantId, hasText: !!text,
    })
    return false
  }
  const message_type = role === 'user' ? 'user_question' : 'system_response'
  const { error, status } = await supabase
    .from('query_chat_history')
    .insert({
      user_id: userId,
      plant_id: plantId,
      message_text: text,
      message_type,
      citations,
    })
  if (error) {
    console.error('[queryChatHistory] save failed:', { status, message: error.message, details: error.details, hint: error.hint, code: error.code, userId, plantId, role })
    return false
  }
  console.log('[queryChatHistory] saved', role, 'len=', text.length, 'status=', status)
  return true
}

// ─── Delete all history for this user + plant ─────────────────────────────────

export async function clearChatHistory(plantId) {
  const userId = getUserId()
  if (!userId || !plantId) return
  const { error } = await supabase
    .from('query_chat_history')
    .delete()
    .eq('user_id', userId)
    .eq('plant_id', plantId)
  if (error) {
    console.warn('[queryChatHistory] clear error:', error.message)
    throw error
  }
}

// ─── Build the conversational-context payload sent with each new query ───────
//
// Spec asks for the previous 5–10 messages. We take the last CONTEXT_TURNS,
// strip rich fields, and send a compact {role, text} list. The edge function
// inlines them in the system prompt so the model can resolve "what about for
// peritectic grades?" against the prior turn.
export function buildContextWindow(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return []
  return messages
    .slice(-CONTEXT_TURNS)
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      text: m.text || '',
    }))
    .filter(m => m.text.trim().length > 0)
}
