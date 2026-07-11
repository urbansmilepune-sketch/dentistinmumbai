'use client'

// Tiptap editor for the dentist article writer. Deliberately minimal for
// non-technical dentists: the toolbar is Bold / Italic / Bullet list /
// Numbered list / Add image / Undo — NO heading buttons (headings are
// disabled in StarterKit too, so pasted content can't smuggle them in).
//
// Exposes an imperative handle so the parent page can drive it during AI
// streaming: setContent() replaces the whole doc (the parent re-renders the
// accumulated draft on each chunk), getHTML()/isEmpty() read it back at
// submit time. immediatelyRender:false is required under Next's SSR — without
// it Tiptap renders on the server and React throws a hydration mismatch.

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

export type ArticleEditorHandle = {
  getHTML: () => string
  setContent: (html: string) => void
  isEmpty: () => boolean
  focus: () => void
}

interface Props {
  placeholder?: string
  onChange?: () => void
}

const PLACEHOLDER =
  'Your article will appear here after clicking Get AI Draft, or start writing directly...'

const ArticleEditor = forwardRef<ArticleEditorHandle, Props>(function ArticleEditor(
  { placeholder = PLACEHOLDER, onChange },
  ref,
) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // No headings — keep the writing surface flat and simple.
        heading: false,
      }),
      Image.configure({ inline: false, HTMLAttributes: { style: 'max-width:100%;height:auto;border-radius:10px;' } }),
      Placeholder.configure({ placeholder }),
    ],
    content: '',
    editorProps: {
      attributes: {
        style: 'outline:none;min-height:340px;font-size:15px;line-height:1.7;color:var(--text);',
      },
    },
    onUpdate() { onChange?.() },
  })

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() ?? '',
    setContent: (html: string) => {
      // `false` = don't emit an update transaction per keystroke of streamed
      // text; the parent already owns the draft state.
      editor?.commands.setContent(html, { emitUpdate: false })
    },
    isEmpty: () => editor?.isEmpty ?? true,
    focus: () => editor?.commands.focus(),
  }), [editor])

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || !editor) return
    setUploadError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', 'article')
      const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) {
        setUploadError(data?.error || 'Image upload failed. Please try again.')
        return
      }
      editor.chain().focus().setImage({ src: data.url }).run()
    } catch {
      setUploadError('Image upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const btn = (active: boolean): React.CSSProperties => ({
    minWidth: 36, height: 34, padding: '0 10px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    border: '1px solid var(--border)', borderRadius: 8,
    background: active ? 'var(--blue-light)' : '#fff',
    color: active ? 'var(--blue)' : 'var(--text-secondary)',
    fontWeight: 600, fontSize: 14, cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  })

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <button type="button" title="Bold" onClick={() => editor?.chain().focus().toggleBold().run()} style={btn(!!editor?.isActive('bold'))}><b>B</b></button>
        <button type="button" title="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()} style={btn(!!editor?.isActive('italic'))}><i>I</i></button>
        <button type="button" title="Bullet list" onClick={() => editor?.chain().focus().toggleBulletList().run()} style={btn(!!editor?.isActive('bulletList'))}>• List</button>
        <button type="button" title="Numbered list" onClick={() => editor?.chain().focus().toggleOrderedList().run()} style={btn(!!editor?.isActive('orderedList'))}>1. List</button>
        <button type="button" title="Add image" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ ...btn(false), cursor: uploading ? 'wait' : 'pointer' }}>
          {uploading ? 'Uploading…' : '🖼️ Image'}
        </button>
        <button type="button" title="Undo" onClick={() => editor?.chain().focus().undo().run()} style={btn(false)}>↶ Undo</button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImagePick} style={{ display: 'none' }} />
      </div>

      {uploadError && (
        <div style={{ padding: '8px 14px', background: '#FEE2E2', color: '#991B1B', fontSize: 13 }}>{uploadError}</div>
      )}

      {/* Editing surface */}
      <div style={{ padding: '16px 18px' }}>
        <EditorContent editor={editor} />
      </div>

      {/* Placeholder + list styling for the editor content. Scoped to .ProseMirror
          which Tiptap sets on the editable node; kept as an inline <style> so it
          ships with the component (no new CSS files/classes per guardrails). */}
      <style>{`
        .ProseMirror p { margin: 0 0 12px; }
        .ProseMirror ul, .ProseMirror ol { margin: 0 0 12px; padding-left: 22px; }
        .ProseMirror li { margin: 2px 0; }
        .ProseMirror img { max-width: 100%; height: auto; border-radius: 10px; margin: 8px 0; }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left; color: var(--muted); pointer-events: none; height: 0;
        }
      `}</style>
    </div>
  )
})

export default ArticleEditor
export type { Editor }
