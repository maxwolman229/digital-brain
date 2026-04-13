// Central brand theme. Changing values here updates the entire app.
// White-label builds (e.g. danieli-demo) override this file only.

export const THEME = {
  // Brand
  primary:       '#062044',   // dark navy — headers, buttons, text
  primaryDim:    '#0d2d55',   // navy variant — dropdown bg
  accent:        '#4FA89A',   // teal — accents, active states, verified
  accentDeep:    '#2d6b5e',   // dark teal — established status
  accentLight:   '#b8e0d8',   // light teal — active status

  // Surfaces
  bg:            '#f4f1ed',   // warm off-white — page background
  sectionBg:     '#FAFAF9',   // light section background
  cardBg:        '#ffffff',   // card background
  inputBg:       '#f8f6f4',   // input field background

  // Borders & text
  border:        '#D8CEC3',   // border, muted divider
  text:          '#1F1F1F',   // body text
  muted:         '#8a8278',   // muted text
  mutedLight:    '#b0a898',   // lighter muted text

  // Brand name shown in UI
  brandName:     'M/D/1',
  brandTagline:  'Knowledge Bank',

  // RGB channels for rgba() — must match primary/accent hex above
  primaryRgb:    '6,32,68',
  accentRgb:     '79,168,154',
}

// Kebab-cases a camelCase key: "primaryDim" → "primary-dim"
function kebab(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

// Writes the theme object as CSS custom properties on the document root.
// Called once at app startup. Components reference vars via var(--md1-*).
export function applyTheme(theme = THEME) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  Object.entries(theme).forEach(([key, value]) => {
    if (typeof value === 'string') {
      root.style.setProperty(`--md1-${kebab(key)}`, value)
    }
  })
}
