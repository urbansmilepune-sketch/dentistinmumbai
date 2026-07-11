// Streams an AI-written first draft of a patient-education article back to the
// dentist's editor as plain-text chunks.
//
// Auth is email-only (no user_id on dentists). We resolve the caller's dentist
// row, pull the personalisation fields (name, clinic, area, city, specialties),
// then open a streaming Messages API call to Anthropic and pipe the text
// deltas straight through to the browser. The client reads the response body
// with a ReadableStream reader and appends each chunk into Tiptap.
//
// The AI is an assistant: any failure returns a clear error the editor shows as
// a banner — the dentist can always write the article by hand instead.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { CLAUDE_MODEL } from '@/lib/anthropic'
import { getCityBySlug } from '@/config/cities'
import { topicLabel, isTopicType } from '@/lib/articles'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

const SYSTEM_PROMPT = `You are writing a patient education article for a dental clinic.
Write in a warm, trustworthy tone that patients can understand.
No medical jargon. Structure: opening hook → what it is →
why patients need to know → what to expect → reassuring close.
350-450 words. No markdown headings. Use short paragraph breaks only.
Do not mention specific prices. End with one sentence encouraging
the patient to consult their dentist.`

type DentistDraftRow = {
  id: string
  name: string | null
  clinic_name: string | null
  city: string | null
  specialties: string[] | null
  areas: { name: string | null } | null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dentist = await resolveCurrentDentist<DentistDraftRow>(
    supabase,
    'id, name, clinic_name, city, specialties, areas(name)',
  )
  if (!dentist) return NextResponse.json({ error: 'No dentist profile found for your account.' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const topicType = body?.topic_type
  if (!title) return NextResponse.json({ error: 'Add a title first — it guides the draft.' }, { status: 400 })
  if (!isTopicType(topicType)) return NextResponse.json({ error: 'Invalid topic type.' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI drafting is not available right now.' }, { status: 503 })

  const city = getCityBySlug(dentist.city)
  const areaName = dentist.areas?.name || city.cityName
  const clinicName = dentist.clinic_name || 'the clinic'
  const drName = dentist.name || 'the dentist'
  const specialties = Array.isArray(dentist.specialties) && dentist.specialties.length > 0
    ? dentist.specialties.join(', ')
    : 'General Dentistry'

  const userPrompt =
`Write a patient education article for ${drName} at ${clinicName} in ${areaName}, ${city.cityName}.
Topic type: ${topicLabel(topicType)}
Article title: ${title}
Dentist specialisation: ${specialties}
Write the full article now.`

  let upstream: Response
  try {
    upstream = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
  } catch (err) {
    console.error('[articles/ai-draft] network error', err)
    return NextResponse.json({ error: 'Could not reach the AI service. Please try again.' }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '')
    console.error('[articles/ai-draft] anthropic error', upstream.status, detail.slice(0, 300))
    return NextResponse.json({ error: `AI service returned ${upstream.status}. Please try again.` }, { status: 502 })
  }

  // Parse Anthropic's SSE stream and re-emit only the text deltas as a plain
  // UTF-8 text stream. The client doesn't need to understand the SSE envelope
  // — it just appends whatever text arrives.
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = ''
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // SSE events are separated by a blank line. Process complete events
          // and keep the trailing partial in the buffer.
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const evt of events) {
            for (const line of evt.split('\n')) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('data:')) continue
              const payload = trimmed.slice(5).trim()
              if (!payload || payload === '[DONE]') continue
              try {
                const json = JSON.parse(payload)
                if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                  const text = json.delta.text as string
                  if (text) controller.enqueue(encoder.encode(text))
                }
              } catch {
                // Ignore non-JSON keepalive lines.
              }
            }
          }
        }
      } catch (err) {
        console.error('[articles/ai-draft] stream error', err)
      } finally {
        controller.close()
      }
    },
    cancel() {
      reader.cancel().catch(() => {})
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
