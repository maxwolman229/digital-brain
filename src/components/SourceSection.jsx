import { useState } from 'react'
import { ExternalLink, History, FileX } from 'lucide-react'
import { FNT, FNTM } from '../lib/constants.js'
import { getSignedUrl, fetchCandidateById } from '../lib/documents.js'
import CandidateEditHistoryModal from './CandidateEditHistoryModal.jsx'

// =============================================================================
// SourceSection — provenance card on rule and assertion detail views.
//
// Renders only when the underlying item carries source-citation metadata
// (the columns added by migration 034). Three states:
//
//   • normal       — sourceDocument present → "Extracted from [title]" with
//                    a clickable signed-URL link, the verbatim excerpt, and
//                    optional "Edited from source · view edit history" link.
//   • orphan       — sourceDocumentDeleted=true → excerpt still visible,
//                    no link, "originally extracted from a now-deleted
//                    document" copy.
//   • non-admin    — sourceDocument is null because RLS blocks the embed,
//                    but sourceDocumentId is set → minimal "extracted from
//                    a source document" line, no link.
// =============================================================================

export default function SourceSection({ item }) {
  const {
    sourceDocumentId, sourceExcerpt, sourceExtractionCandidateId,
    wasEditedFromSource, sourceDocumentDeleted, sourceDocument,
  } = item

  const [historyCandidate, setHistoryCandidate] = useState(null)
  const [opening, setOpening] = useState(false)

  const hasAny = sourceDocumentId || sourceDocumentDeleted || sourceExcerpt
  if (!hasAny) return null

  async function openOriginal() {
    if (!sourceDocument?.file_path) return
    try {
      const url = await getSignedUrl(sourceDocument.file_path, 600)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      alert(`Could not open document: ${e.message}`)
    }
  }

  async function openHistory() {
    if (!sourceExtractionCandidateId || opening) return
    setOpening(true)
    try {
      const c = await fetchCandidateById(sourceExtractionCandidateId)
      setHistoryCandidate(c)
    } catch (e) {
      alert(`Could not load edit history: ${e.message}`)
    } finally {
      setOpening(false)
    }
  }

  return (
    <div style={{ marginBottom: 18, fontFamily: FNT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, fontFamily: FNT }}>
          Source
        </span>
        {wasEditedFromSource && (
          <span style={{
            padding: '2px 8px', borderRadius: 2,
            background: '#fff4d6', color: '#7a5800',
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: FNT,
          }}>
            Edited from source
          </span>
        )}
      </div>

      {/* Document line */}
      {sourceDocumentDeleted ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--md1-muted)', fontStyle: 'italic', fontFamily: FNT, marginBottom: 8 }}>
          <FileX size={14} />
          Originally extracted from a document that has since been deleted
        </div>
      ) : sourceDocument ? (
        <div style={{ fontSize: 12, color: 'var(--md1-text)', fontFamily: FNT, marginBottom: 8 }}>
          Extracted from{' '}
          <button
            onClick={openOriginal}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'transparent', border: 'none', padding: 0,
              color: 'var(--md1-accent)', cursor: 'pointer',
              fontFamily: FNT, fontSize: 12, fontWeight: 600,
              textDecoration: 'underline',
            }}
          >
            {sourceDocument.title}
            <ExternalLink size={12} />
          </button>
        </div>
      ) : sourceDocumentId ? (
        <div style={{ fontSize: 12, color: 'var(--md1-muted)', fontFamily: FNT, marginBottom: 8 }}>
          Extracted from a source document
        </div>
      ) : null}

      {/* Verbatim excerpt — quoted-block treatment */}
      {sourceExcerpt && (
        <blockquote style={{
          margin: 0, padding: '8px 14px',
          borderLeft: '3px solid var(--md1-border)',
          background: '#faf9f7', borderRadius: 2,
          fontSize: 12, color: '#5a5550', fontStyle: 'italic',
          fontFamily: FNT, lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          “{sourceExcerpt}”
        </blockquote>
      )}

      {wasEditedFromSource && sourceExtractionCandidateId && (
        <button
          onClick={openHistory}
          disabled={opening}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
            background: 'transparent', border: 'none', padding: 0,
            color: 'var(--md1-accent)', cursor: 'pointer',
            fontFamily: FNT, fontSize: 11, fontWeight: 600,
          }}
        >
          <History size={12} /> {opening ? 'Loading…' : 'View edit history'}
        </button>
      )}

      {historyCandidate && (
        <CandidateEditHistoryModal
          candidate={historyCandidate}
          onClose={() => setHistoryCandidate(null)}
        />
      )}
    </div>
  )
}
