import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const marketingRoot = resolve(scriptDir, '..')

const files = {
  knowledgeCard: readFileSync(resolve(marketingRoot, 'src/components/KnowledgeCardPreview.astro'), 'utf8'),
  chatBot: readFileSync(resolve(marketingRoot, 'src/components/ChatBotPreview.astro'), 'utf8'),
  globalCss: readFileSync(resolve(marketingRoot, 'src/styles/global.css'), 'utf8'),
}

const expectedSnippets = [
  {
    file: 'KnowledgeCardPreview.astro',
    source: files.knowledgeCard,
    snippets: [
      'The title states the knowledge being presented in plain language.',
      'Where the knowledge applies.',
      'The knowledge itself, broken into structured fields.',
      'Every card carries who has verified it',
      'Every K-Card is fully traceable.',
      'The version history shows how the card has changed',
    ],
  },
  {
    file: 'ChatBotPreview.astro',
    source: files.chatBot,
    snippets: [
      'Operator needs assistance and asks chatbot for information',
      'Chatbot uses RAG to retrieve a best-efforts response',
      'Poor quality response causes frustration',
      'SDK flags insights for improvement of the knowledge base',
    ],
  },
  {
    file: 'global.css',
    source: files.globalCss,
    snippets: [
      '[data-tip]::after',
      'content: attr(data-tip)',
      '[data-tip]:hover::after',
      '[data-tip]:focus-visible::after',
    ],
  },
]

const failures = expectedSnippets.flatMap(({ file, source, snippets }) =>
  snippets
    .filter((snippet) => !source.includes(snippet))
    .map((snippet) => `${file} is missing tooltip snippet: ${snippet}`)
)

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Marketing tooltip regression check passed.')
