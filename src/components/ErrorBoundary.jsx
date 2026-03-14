import { Component } from 'react'

const FNT = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#062044',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 40, fontFamily: FNT,
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(242,101,47,0.4)',
            borderRadius: 6, padding: '32px 36px', maxWidth: 560, width: '100%',
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 1.6 }}>
              The app encountered an unexpected error. Refresh the page to continue — your data is safe.
            </div>
            <div style={{
              padding: '10px 14px', background: 'rgba(0,0,0,0.3)',
              borderRadius: 4, fontSize: 11, color: '#F2652F',
              fontFamily: "'IBM Plex Mono', monospace",
              lineHeight: 1.6, marginBottom: 20,
              wordBreak: 'break-word',
            }}>
              {this.state.error.message || String(this.state.error)}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '9px 22px', borderRadius: 3, fontSize: 12,
                background: '#FFFFFF', border: 'none', color: '#062044',
                cursor: 'pointer', fontFamily: FNT, fontWeight: 800,
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
