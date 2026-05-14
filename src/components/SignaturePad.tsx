'use client'

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'

export interface SignaturePadHandle {
  toDataURL: () => string | null
  clear: () => void
  isEmpty: () => boolean
}

interface Props {
  /** Logical pixel height of the pad. Width is fluid up to the parent. */
  height?: number
  onChange?: (hasSignature: boolean) => void
}

/**
 * Touch/mouse/pen signature pad backed by a <canvas>. Sizes its pixel buffer
 * to the rendered CSS width times device-pixel-ratio on mount so the line
 * stays crisp on high-DPI screens. `touch-action: none` is required or mobile
 * browsers scroll the page while the patient is signing.
 */
const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { height = 180, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const [hasContent, setHasContent] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#0F1923'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    lastPoint.current = pointFromEvent(e)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !lastPoint.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const p = pointFromEvent(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPoint.current = p
    if (!hasContent) {
      setHasContent(true)
      onChange?.(true)
    }
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (drawing.current) canvasRef.current?.releasePointerCapture(e.pointerId)
    drawing.current = false
    lastPoint.current = null
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    setHasContent(false)
    onChange?.(false)
  }

  function toDataURL(): string | null {
    if (!hasContent) return null
    return canvasRef.current?.toDataURL('image/png') ?? null
  }

  useImperativeHandle(ref, () => ({
    toDataURL,
    clear,
    isEmpty: () => !hasContent,
  }))

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        style={{
          width: '100%',
          height,
          background: '#fff',
          border: '1.5px solid var(--border)',
          borderRadius: 10,
          touchAction: 'none',
          cursor: 'crosshair',
          display: 'block',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Patient signs above</span>
        <button type="button" onClick={clear}
          style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: 600 }}>
          Clear
        </button>
      </div>
    </div>
  )
})

export default SignaturePad
