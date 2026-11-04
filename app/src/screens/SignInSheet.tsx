import { useState, type FormEvent } from 'react'
import { MailCheck } from 'lucide-react'
import { PrimaryButton, Sheet } from '@/components/kit'
import { useStore } from '@/lib/store'

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export function SignInSheet() {
  const { signInOpen, closeSignIn, signInReason, signInWithEmail, signInWithGoogle, googleEnabled } = useStore()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter an email address like you@example.com.')
      return
    }
    setBusy(true)
    const res = await signInWithEmail(email.trim())
    setBusy(false)
    if (res.error) setError(res.error)
    else setSentTo(email.trim())
  }

  const onOpenChange = (o: boolean) => {
    if (!o) {
      closeSignIn()
      window.setTimeout(() => { setSentTo(null); setError(null) }, 300)
    }
  }

  return (
    <Sheet open={signInOpen} onOpenChange={onOpenChange} title={sentTo ? 'Check your email' : 'Save your games'} description={sentTo ? undefined : signInReason ?? 'Sign in to watch games and get price alerts.'}>
      {sentTo ? (
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex items-start gap-3 rounded-2xl bg-inset p-4">
            <MailCheck size={22} className="mt-0.5 flex-none text-link" aria-hidden="true" />
            <p className="m-0 text-[15px] leading-[1.5]">
              We sent a sign-in link to <strong>{sentTo}</strong>. Open it on this device and you'll come right back here.
            </p>
          </div>
          <button type="button" onClick={() => setSentTo(null)} className="h-11 text-[15px] font-semibold text-link">Use a different email</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          {googleEnabled && (
          <>
          <button type="button" onClick={() => void signInWithGoogle()} className="flex h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-[#2A3858] bg-[#1E2B48] text-[15px] font-bold">
            <GoogleMark /> Continue with Google
          </button>
          <div className="flex items-center gap-3 py-1 text-[12px] text-faint" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
          </div>
          </>
          )}
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3" noValidate>
            <label htmlFor="email" className="text-[13px] font-semibold text-sub">Email</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-invalid={!!error}
              aria-describedby={error ? 'email-error' : undefined}
              className="-mt-1 h-[52px] rounded-2xl border border-[#2A3858] bg-[#0E1626] px-4 text-[16px] placeholder:text-faint focus:border-glacier focus:outline-none"
            />
            {error && <p id="email-error" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
            <PrimaryButton type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</PrimaryButton>
          </form>
          <p className="m-0 text-center text-[12px] text-faint">No password. We only email you about games you choose.</p>
        </div>
      )}
    </Sheet>
  )
}
