import { useState, type FormEvent } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { PrimaryButton, Sheet } from '@/components/kit'
import { DEMO } from '@/lib/config'
import { load, save } from '@/lib/storage'
import { useStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const CONTACT = 'hello@tixcast.app'
const TOPICS = [
  { id: 'idea', label: 'An idea' },
  { id: 'bug', label: "Something's broken" },
  { id: 'price', label: 'A price looks wrong' },
  { id: 'other', label: 'Something else' },
] as const

type Topic = (typeof TOPICS)[number]['id']

export function FeedbackSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { email: accountEmail, session } = useStore()
  const [topic, setTopic] = useState<Topic>('idea')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const replyTo = accountEmail ?? (email.trim() || null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!message.trim()) return setError('Write a sentence or two so we know what to look at.')
    if (!accountEmail && email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return setError('That email address looks incomplete. Leave it blank if you don’t need a reply.')
    }
    setBusy(true)
    const row = {
      user_id: session?.user.id ?? null,
      email: replyTo,
      topic,
      message: message.trim().slice(0, 4000),
      page: window.location.pathname + window.location.hash,
      user_agent: navigator.userAgent.slice(0, 300),
    }
    if (DEMO || !supabase) {
      save('feedback', [...load<unknown[]>('feedback', []), { ...row, created_at: new Date().toISOString() }])
    } else {
      const { error: err } = await supabase.from('feedback').insert(row)
      if (err) {
        setBusy(false)
        return setError(`Your message didn't send. Try again, or email ${CONTACT}.`)
      }
    }
    setBusy(false)
    setMessage('')
    onOpenChange(false)
    toast('Feedback sent', { description: replyTo ? `Thanks. We'll reply to ${replyTo} if we have questions.` : 'Thanks. Kyle reads every message.' })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked; the address is selectable text */
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Help and feedback" description="Tell us what's working, what isn't, or what you wish Tixcast did.">
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4 pb-4" noValidate>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-semibold text-sub">What's it about?</legend>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={topic === t.id}
                onClick={() => setTopic(t.id)}
                className={cn('h-9 rounded-full border px-3.5 text-[13px] font-semibold', topic === t.id ? 'glacier border-transparent' : 'border-[#2A3858] bg-[#0E1626]')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="feedback-message" className="text-[13px] font-semibold text-sub">Message</label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder={topic === 'price' ? 'Which game, and what price did you see on the ticket site?' : topic === 'bug' ? 'What were you doing, and what happened?' : 'Type here'}
            className="resize-none rounded-2xl border border-[#2A3858] bg-[#0E1626] px-4 py-3 text-[16px] leading-[1.5] placeholder:text-faint focus:border-glacier focus:outline-none"
          />
        </div>

        {!accountEmail && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="feedback-email" className="text-[13px] font-semibold text-sub">Your email, if you'd like a reply</label>
            <input
              id="feedback-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-[52px] rounded-2xl border border-[#2A3858] bg-[#0E1626] px-4 text-[16px] placeholder:text-faint focus:border-glacier focus:outline-none"
            />
          </div>
        )}

        {error && <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
        <PrimaryButton type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</PrimaryButton>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-inset px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 text-[12px] text-sub">Or email us</p>
            <p className="m-0 select-all truncate text-[15px] font-semibold">{CONTACT}</p>
          </div>
          <button type="button" onClick={() => void copy()} className="flex h-9 flex-none items-center gap-1.5 rounded-full bg-[#1E2B48] px-3 text-[13px] font-semibold">
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
