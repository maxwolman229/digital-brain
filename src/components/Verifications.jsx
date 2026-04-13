import { useState, useEffect } from 'react'
import { FNT } from '../lib/constants.js'
import { fetchItemVerifications, addVerification } from '../lib/db.js'
import { getDisplayName, getUserId } from '../lib/userContext.js'

export default function Verifications({ targetType, targetId, createdById }) {
  const [names, setNames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!targetId) return
    setLoading(true)
    setError(null)
    fetchItemVerifications(targetType, targetId).then(data => {
      setNames(data)
      setLoading(false)
    })
  }, [targetType, targetId])

  const me = getDisplayName()
  const myId = getUserId()
  const alreadyVerified = names.includes(me)
  const isOwnItem = createdById && myId && createdById === myId

  async function handleVerify() {
    if (alreadyVerified || loading || isOwnItem) return
    setError(null)
    // Optimistic update
    setNames(prev => [...prev, me])
    try {
      await addVerification(targetType, targetId)
    } catch (err) {
      // Roll back optimistic add and surface the error
      setNames(prev => prev.filter(n => n !== me))
      setError(err.message || 'Could not verify — please try again.')
    }
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {!isOwnItem && (
          <button
            onClick={handleVerify}
            disabled={loading || alreadyVerified}
            style={{
              padding: '6px 14px', borderRadius: 3, fontSize: 11,
              background: alreadyVerified ? '#e6f5f1' : '#FFFFFF',
              border: '1px solid var(--md1-accent)', color: 'var(--md1-accent)',
              cursor: (loading || alreadyVerified) ? 'default' : 'pointer',
              fontFamily: FNT, fontWeight: 700,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {alreadyVerified ? '✓ Verified' : '✓ Verify from Experience'}
          </button>
        )}
        {isOwnItem && (
          <div style={{
            padding: '6px 12px', borderRadius: 3, fontSize: 11,
            background: '#f0eeec', border: '1px solid var(--md1-border)',
            color: 'var(--md1-muted)', fontFamily: FNT, fontStyle: 'italic',
          }}>
            You created this — ask a colleague to verify it
          </div>
        )}
        {!loading && names.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--md1-muted)', fontFamily: FNT }}>
            {names.length} verification{names.length > 1 ? 's' : ''}: {names.join(', ')}
          </span>
        )}
      </div>
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#c0392b', fontFamily: FNT }}>
          {error}
        </div>
      )}
    </div>
  )
}
