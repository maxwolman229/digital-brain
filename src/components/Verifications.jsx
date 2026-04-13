import { useState, useEffect } from 'react'
import { FNT } from '../lib/constants.js'
import { fetchItemVerifications, addVerification } from '../lib/db.js'
import { getDisplayName } from '../lib/userContext.js'

export default function Verifications({ targetType, targetId }) {
  const [names, setNames] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!targetId) return
    setLoading(true)
    fetchItemVerifications(targetType, targetId).then(data => {
      setNames(data)
      setLoading(false)
    })
  }, [targetType, targetId])

  const me = getDisplayName()
  const alreadyVerified = names.includes(me)

  async function handleVerify() {
    if (alreadyVerified || loading) return
    setNames(prev => [...prev, me])
    await addVerification(targetType, targetId)
  }

  return (
    <div style={{ marginBottom: 18, display: 'flex', gap: 8, alignItems: 'center' }}>
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
      {!loading && names.length > 0 && (
        <span style={{ fontSize: 10, color: 'var(--md1-muted)', fontFamily: FNT }}>
          {names.length} verification{names.length > 1 ? 's' : ''}: {names.join(', ')}
        </span>
      )}
    </div>
  )
}
