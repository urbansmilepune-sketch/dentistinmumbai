// Shared helpers for the dentist article publishing system: topic-type
// config (the four cards the dentist taps), slug generation, and a
// dependency-free HTML sanitiser for rendering Tiptap output server-side.
//
// No new npm packages are allowed for this feature, so sanitisation is a
// conservative regex pass rather than DOMPurify/sanitize-html. It runs on
// content that a dentist authored and an admin approved, but we still strip
// script/style/iframe-style tags, event-handler attributes, and
// javascript:/data: URLs so an approved article can never inject script into
// a public page.

export type ArticleTopicType =
  | 'treatment_explainer'
  | 'patient_faq'
  | 'case_story'
  | 'dental_tip'

export type TopicConfig = {
  type: ArticleTopicType
  emoji: string
  label: string
  blurb: string
  // Placeholder shown in the title input after the dentist picks this topic.
  titlePlaceholder: string
}

export const TOPIC_TYPES: TopicConfig[] = [
  {
    type: 'treatment_explainer',
    emoji: '🦷',
    label: 'Treatment Explainer',
    blurb: 'Explain a procedure to patients',
    titlePlaceholder: 'What to expect during [treatment name]',
  },
  {
    type: 'patient_faq',
    emoji: '❓',
    label: 'Patient FAQ',
    blurb: 'Answer questions patients always ask you',
    titlePlaceholder: 'Everything patients ask me about [topic]',
  },
  {
    type: 'case_story',
    emoji: '📋',
    label: 'Case Story',
    blurb: 'Share a patient success story (anonymised)',
    titlePlaceholder: 'How we helped a patient with [condition]',
  },
  {
    type: 'dental_tip',
    emoji: '💡',
    label: 'Dental Tip',
    blurb: 'Quick advice patients can use today',
    titlePlaceholder: 'The things your dentist wants you to know about [topic]',
  },
]

const TOPIC_BY_TYPE: Record<string, TopicConfig> = Object.fromEntries(
  TOPIC_TYPES.map(t => [t.type, t]),
)

export function isTopicType(v: unknown): v is ArticleTopicType {
  return typeof v === 'string' && v in TOPIC_BY_TYPE
}

export function topicConfig(type: string): TopicConfig | null {
  return TOPIC_BY_TYPE[type] ?? null
}

export function topicLabel(type: string): string {
  return TOPIC_BY_TYPE[type]?.label ?? 'Article'
}

// Kebab-case slug from a title. Strips accents, drops anything that isn't a
// letter/number, collapses runs of dashes. Bounded to 80 chars so a rambling
// title doesn't produce an unwieldy URL.
export function slugifyTitle(title: string): string {
  return String(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

// 4-char alphanumeric suffix for slug uniqueness (spec: "append random 4
// chars"). No ambiguous characters (0/o/1/l) so a support agent reading a
// slug aloud isn't misheard.
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export function randomSlugSuffix(): string {
  let out = ''
  for (let i = 0; i < 4; i++) {
    out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]
  }
  return out
}

// Full slug for a new article: kebab title + random suffix. A title that
// slugifies to nothing (e.g. all punctuation) falls back to "article".
export function buildArticleSlug(title: string): string {
  const base = slugifyTitle(title) || 'article'
  return `${base}-${randomSlugSuffix()}`
}

// Dependency-free HTML sanitiser for Tiptap content rendered on public pages.
// Order matters: kill whole dangerous elements (with their content) first,
// then strip event-handler attributes and dangerous URL schemes from what
// survives.
export function sanitizeArticleHtml(html: string): string {
  if (!html) return ''
  let out = String(html)

  // Remove entire dangerous elements including their inner content.
  out = out.replace(/<\s*(script|style|iframe|object|embed|noscript|template|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  // Self-closing / unclosed variants of the same tags.
  out = out.replace(/<\s*\/?\s*(script|style|iframe|object|embed|noscript|template|link|meta|base)\b[^>]*>/gi, '')

  // Strip inline event handlers: on*="..." / on*='...' / on*=value.
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')

  // Neutralise javascript:/vbscript:/data: URLs in href/src attributes.
  out = out.replace(/\s(href|src)\s*=\s*"(?:\s*(?:javascript|vbscript|data)\s*:)[^"]*"/gi, ' $1="#"')
  out = out.replace(/\s(href|src)\s*=\s*'(?:\s*(?:javascript|vbscript|data)\s*:)[^']*'/gi, " $1='#'")

  return out
}

// Plain text from HTML for meta descriptions and previews. Decodes the small
// set of entities Tiptap emits and collapses whitespace.
export function htmlToText(html: string): string {
  if (!html) return ''
  return String(html)
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// First `max` chars of the article's plain text, cut on a word boundary, for
// the <meta name="description"> (spec: first 155 chars, HTML stripped).
export function articleDescription(html: string, max = 155): string {
  const text = htmlToText(html)
  if (text.length <= max) return text
  const clipped = text.slice(0, max)
  const lastSpace = clipped.lastIndexOf(' ')
  return (lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trim() + '…'
}
