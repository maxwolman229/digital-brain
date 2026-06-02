import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const marketingRoot = resolve(scriptDir, '..')

const read = (path) => readFileSync(resolve(marketingRoot, path), 'utf8')

const files = {
  siteNav: read('src/components/SiteNav.astro'),
  consolePreview: read('src/components/KnowledgeConsolePreview.astro'),
  knowledgeCard: read('src/components/KnowledgeCardPreview.astro'),
  chatBot: read('src/components/ChatBotPreview.astro'),
  platform: read('src/pages/platform.astro'),
  globalCss: read('src/styles/global.css'),
}

const expectedSnippets = [
  {
    file: 'SiteNav.astro',
    source: files.siteNav,
    snippets: ['data-md1-nav', 'is-scrolled', 'hero.getBoundingClientRect().bottom'],
  },
  {
    file: 'KnowledgeConsolePreview.astro',
    source: files.consolePreview,
    snippets: ['md1-console-preview', 'md1-doc-highlight', 'Document &rarr; K-Cards'],
  },
  {
    file: 'KnowledgeCardPreview.astro',
    source: files.knowledgeCard,
    snippets: [
      'md1-kcard-preview',
      'md1-preview-hotspot',
      'data-add-toggle',
      'data-add-popover',
      'New context tag',
      'Rule of Thumb',
    ],
  },
  {
    file: 'ChatBotPreview.astro',
    source: files.chatBot,
    snippets: ['md1-chat-preview', 'md1-chat-message', 'md1-chat-signal', 'md1-signal-dot'],
  },
  {
    file: 'platform.astro',
    source: files.platform,
    snippets: ['md1-product-band', 'md1-product-arrow', 'Explore The Knowledge Bank', 'Explore the ChatBotSDK'],
  },
  {
    file: 'global.css',
    source: files.globalCss,
    snippets: [
      '.md1-preview-hotspot:hover',
      '.md1-add-popover[data-open="true"]',
      '.md1-product-band:hover',
      '.md1-home-nav.is-scrolled',
      '.md1-doc-highlight:hover',
      '.md1-chat-signal:hover',
    ],
  },
]

const failures = expectedSnippets.flatMap(({ file, source, snippets }) =>
  snippets
    .filter((snippet) => !source.includes(snippet))
    .map((snippet) => `${file} is missing UX affordance snippet: ${snippet}`)
)

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Marketing UX regression check passed.')
