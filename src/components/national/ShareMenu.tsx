'use client'

// Share dropdown used by case and profile share buttons on dentistinindia.in.
//
// Channels: WhatsApp, Instagram, LinkedIn, X and copy link. Instagram has no
// web share link, so it shares the tall story-size card picture through the
// phone's share sheet (Instagram shows up there), or downloads it on a
// computer so it can be posted from the app.
//
// The story picture is fetched as soon as the menu opens: phones only allow
// the share sheet straight after a tap, so it has to be ready by then.

import { useEffect, useRef, useState } from 'react'

export interface ShareMenuProps {
  /** Public link being shared (always the dentistinindia.in URL). */
  url: string
  /** Message that goes with the link on WhatsApp. */
  whatsappText: string
  /** Short line for X / Twitter. */
  tweetText: string
  /** Story-size card picture (1080x1920 PNG) for Instagram. */
  storyImageUrl: string
  /** File name when the story picture is saved. */
  storyFileName: string
  /** Button text and tooltip. */
  label?: string
  title?: string
  compact?: boolean
  /** Primary (filled) look for the owner's "Share my profile". */
  primary?: boolean
  /** Fired once per share action, for analytics. */
  onShare?: () => void
}

export default function ShareMenu({ url, whatsappText, tweetText, storyImageUrl, storyFileName, label = '↗ Share', title = 'Share', compact = false, primary = false, onShare }: ShareMenuProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [igNote, setIgNote] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const storyFile = useRef<File | null>(null)

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`
  const linkedinHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(url)}`

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    // Get the story picture ready for the Instagram option.
    if (!storyFile.current) {
      fetch(storyImageUrl)
        .then(r => (r.ok ? r.blob() : Promise.reject(new Error('card'))))
        .then(b => { storyFile.current = new File([b], storyFileName, { type: 'image/png' }) })
        .catch(() => {})
    }
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, storyImageUrl, storyFileName])

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      onShare?.()
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked; the other channels still work.
    }
  }

  function onChannel(href: string) {
    onShare?.()
    window.open(href, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  async function onInstagram() {
    onShare?.()
    const file = storyFile.current
    if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        setOpen(false)
        return
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
        // Fall through to saving the picture.
      }
    }
    // Computer, or a phone without file sharing: save the picture instead.
    const a = document.createElement('a')
    a.href = file ? URL.createObjectURL(file) : storyImageUrl
    a.download = storyFileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setIgNote('Picture saved. Post it as a story from Instagram and add the link sticker.')
    window.setTimeout(() => setIgNote(null), 5000)
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v) }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        aria-label={compact ? title : undefined}
        style={compact ? compactBtn : primary ? primaryBtn : fullBtn}
      >
        {compact ? '↗' : label}
      </button>

      {open && (
        <div
          role="menu"
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
            background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
            boxShadow: '0 6px 18px rgba(15,25,35,0.12)',
            minWidth: 220, padding: 4, overflow: 'hidden', textAlign: 'left',
          }}
        >
          <Item onClick={() => onChannel(whatsappHref)} icon="💚" label="WhatsApp" />
          <Item onClick={onInstagram} icon="📸" label="Instagram story" />
          <Item onClick={() => onChannel(linkedinHref)} icon="💼" label="LinkedIn" />
          <Item onClick={() => onChannel(twitterHref)} icon="🐦" label="Twitter / X" />
          <Item onClick={onCopy} icon="📋" label={copied ? 'Copied!' : 'Copy link'} highlight={copied} />
          {igNote && <div style={{ padding: '8px 12px', fontSize: 12, color: '#334155', lineHeight: 1.4, maxWidth: 240 }}>{igNote}</div>}
        </div>
      )}
    </div>
  )
}

function Item({ onClick, icon, label, highlight }: { onClick: () => void; icon: string; label: string; highlight?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', textAlign: 'left', minHeight: 40,
        padding: '9px 12px', borderRadius: 7,
        background: highlight ? '#DCFCE7' : 'transparent',
        color: highlight ? '#166534' : '#0F1923',
        border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }} aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

const fullBtn: React.CSSProperties = {
  padding: '8px 14px', minHeight: 36,
  background: '#fff', color: '#0F1923',
  border: '1px solid #E2E8F0', borderRadius: 8,
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontFamily: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  ...fullBtn,
  minHeight: 44, padding: '10px 18px', fontSize: 14,
  background: '#15803D', color: '#fff', border: '1px solid #15803D',
}
const compactBtn: React.CSSProperties = {
  width: 32, height: 32, padding: 0,
  background: 'rgba(255,255,255,0.94)', color: '#0F1923',
  border: '1px solid #E2E8F0', borderRadius: 8,
  fontSize: 14, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
}
