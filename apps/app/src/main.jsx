import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { applyTheme } from './lib/theme.js'

applyTheme()

// IBM Plex Sans ships weights 100-700 only — no 800 or 900. Loading 300
// for Light usage. Anything in the codebase that asked for 800 / 900 was
// silently falling back to synthesized bold (or to the next font in the
// stack), which read as a different font entirely. Those callsites are
// rewritten to use 700 (the actual bold weight that ships).
import '@fontsource/ibm-plex-sans/300.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/700.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
