import { useState } from 'react'
import { ChevronRight, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Screen } from '@/components/layout'
import { PrimaryButton, Sheet, Switch } from '@/components/kit'
import { enablePush, pushState, type PushState } from '@/lib/push'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Avatar } from './Home'
import { FeedbackSheet } from './FeedbackSheet'
import { HowItWorksSheet } from './HowItWorks'

const TEAM_CHOICES = [
  { id: 'LAL', label: 'Lakers' },
  { id: 'LAC', label: 'Clippers' },
]

const PUSH_COPY: Record<PushState, string> = {
  on: 'On for this device',
  off: 'Off on this device',
  blocked: 'Blocked in browser settings',
  'needs-install': 'Add Tixcast to your Home Screen first',
  unsupported: "This browser can't get notifications",
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex min-h-[60px] items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0', className)}>{children}</div>
}

export function ProfileScreen() {
  const { profile, updateProfile, email, signedIn, demo, session, signOut, openSignIn, watches, alerts, events, setPushPromptOpen } = useStore()
  const [push, setPush] = useState<PushState>(() => pushState())
  const [howOpen, setHowOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const name = demo ? 'Demo mode' : signedIn ? profile.display_name || email || 'You' : 'Not signed in'
  const since = session?.user.created_at
    ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(session.user.created_at))
    : null

  const toggleTeam = (id: string) => {
    const has = profile.teams.includes(id)
    if (has && profile.teams.length === 1) {
      toast('Keep at least one team', { description: 'Home picks its best call from your teams.' })
      return
    }
    void updateProfile({ teams: has ? profile.teams.filter((t) => t !== id) : [...profile.teams, id] })
  }

  const onPush = async () => {
    if (push === 'needs-install') return setPushPromptOpen(true)
    const result = await enablePush(session?.user.id ?? null)
    setPush(result)
    if (result === 'on') void updateProfile({ notify_push: true })
  }

  return (
    <Screen className="gap-[22px]">
      <div className="flex items-center gap-3.5">
        <Avatar size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display m-0 truncate text-[32px] font-extrabold leading-none">{name}</h1>
          <p className="m-0 mt-1 text-[13px] text-sub">
            {demo ? 'Sample games. Your choices stay on this device.' : signedIn ? (since ? `Member since ${since}` : email) : 'Sign in to save games and get alerts'}
          </p>
          {profile.founding_member && !demo && (
            <span className="mt-2 inline-block rounded-md bg-[#3A3022] px-2 py-0.5 text-[12px] font-bold text-[#E3B87C]">Founding member</span>
          )}
        </div>
      </div>

      {!signedIn && (
        <PrimaryButton onClick={() => openSignIn()} className="lg:max-w-[360px]">Sign in</PrimaryButton>
      )}

      <div className="flex flex-col gap-[22px] lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
      <div className="flex flex-col gap-[22px]">
      <section aria-labelledby="record-title" className="glass rounded-[20px] p-[18px]">
        <h2 id="record-title" className="m-0 text-[14px] font-semibold text-sub">Your Tixcast</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            [watches.size, "Games you're watching"],
            [alerts.filter((a) => a.active).length, 'Alerts on'],
            [events.length, 'Alerts ready'],
          ].map(([n, label]) => (
            <div key={String(label)}>
              <div className="font-display tabular text-[36px] font-black leading-none">{n}</div>
              <p className="m-0 mt-1 text-[12px] leading-[1.35] text-sub">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="teams-title" className="flex flex-col gap-2.5">
        <h2 id="teams-title" className="m-0 text-[17px] font-bold">Your teams</h2>
        <p className="m-0 -mt-1 text-[13px] text-sub">Home picks your best call from these teams' games.</p>
        <div className="flex gap-2">
          {TEAM_CHOICES.map((t) => {
            const on = profile.teams.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTeam(t.id)}
                className={cn('flex h-10 items-center gap-2 rounded-full pl-1.5 pr-4 text-[14px] font-semibold', on ? 'glacier' : 'glass text-sub')}
              >
                <span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold', on ? 'bg-[rgba(20,32,58,0.18)]' : 'bg-[#2A3858]')}>{t.id}</span>
                {t.label}
              </button>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="tickets-title">
        <h2 id="tickets-title" className="m-0 mb-2 text-[17px] font-bold">Tickets</h2>
        <div className="glass overflow-hidden rounded-2xl">
          <Row>
            <span className="text-[15px]">How many you usually buy</span>
            <div className="flex items-center gap-2" role="group" aria-label="Ticket count">
              <button type="button" aria-label="Fewer tickets" disabled={profile.ticket_count <= 1} onClick={() => void updateProfile({ ticket_count: profile.ticket_count - 1 })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-inset disabled:opacity-40"><Minus size={16} aria-hidden="true" /></button>
              <span className="tabular w-5 text-center text-[16px] font-bold" aria-live="polite">{profile.ticket_count}</span>
              <button type="button" aria-label="More tickets" disabled={profile.ticket_count >= 8} onClick={() => void updateProfile({ ticket_count: profile.ticket_count + 1 })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-inset disabled:opacity-40"><Plus size={16} aria-hidden="true" /></button>
            </div>
          </Row>
        </div>
      </section>

      </div>
      <div className="flex flex-col gap-[22px]">
      <section aria-labelledby="notify-title">
        <h2 id="notify-title" className="m-0 mb-2 text-[17px] font-bold">Notifications</h2>
        <div className="glass overflow-hidden rounded-2xl">
          <Row>
            <div>
              <p className="m-0 text-[15px]">Push notifications</p>
              <p className="m-0 mt-0.5 text-[12px] text-sub">{PUSH_COPY[push]}</p>
            </div>
            {push === 'on' ? (
              <span className="text-[13px] font-semibold text-link">On</span>
            ) : push === 'off' || push === 'needs-install' ? (
              <button type="button" onClick={() => void onPush()} className="primary-fill h-9 rounded-full px-4 text-[13px] font-bold">{push === 'off' ? 'Turn on' : 'How'}</button>
            ) : null}
          </Row>
          <Row>
            <div>
              <p className="m-0 text-[15px]">Email alerts</p>
              <p className="m-0 mt-0.5 text-[12px] text-sub">Backup when a notification can't reach you</p>
            </div>
            <Switch on={profile.notify_email} onChange={(v) => void updateProfile({ notify_email: v })} label="Email alerts" disabled={!signedIn} />
          </Row>
          <Row>
            <div>
              <p className="m-0 text-[15px]">Weekly best calls</p>
              <p className="m-0 mt-0.5 text-[12px] text-sub">Sunday email with your teams' best games</p>
            </div>
            <Switch on={profile.weekly_digest} onChange={(v) => void updateProfile({ weekly_digest: v })} label="Weekly best calls" disabled={!signedIn} />
          </Row>
        </div>
      </section>

      <section aria-labelledby="more-title">
        <h2 id="more-title" className="m-0 mb-2 text-[17px] font-bold">More</h2>
        <div className="glass overflow-hidden rounded-2xl">
          {[
            ['How Tixcast forecasts work', () => setHowOpen(true)],
            ['Privacy and data', () => setPrivacyOpen(true)],
            ['Help and feedback', () => setFeedbackOpen(true)],
          ].map(([label, fn]) => (
            <button key={label as string} type="button" onClick={fn as () => void} className="flex min-h-[52px] w-full items-center justify-between border-b border-line px-4 text-left text-[15px] last:border-b-0">
              {label as string}<ChevronRight size={16} className="text-sub" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      {signedIn && !demo && (
        <button type="button" onClick={() => void signOut()} className="h-12 rounded-[14px] border border-[#3A2A2A] text-[15px] font-semibold text-danger">Sign out</button>
      )}
      </div>
      </div>
      <p className="m-0 text-center text-[12px] text-faint">Tixcast isn't affiliated with the NBA, its teams, or any ticket marketplace.</p>

      <HowItWorksSheet open={howOpen} onOpenChange={setHowOpen} />
      <FeedbackSheet open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <Sheet open={privacyOpen} onOpenChange={setPrivacyOpen} title="Privacy and data">
        <div className="flex flex-col gap-3 pb-4 text-[15px] leading-[1.55] text-[#C9D2E3]">
          <p className="m-0">Tixcast stores your email, the games you watch, your alerts, and the devices you allow notifications on. That's it.</p>
          <p className="m-0">We don't sell your data or share it with ticket sellers. When you tap Buy, you leave Tixcast for the seller's site, and we may earn a referral fee at no cost to you.</p>
          <p className="m-0">To delete your account and everything in it, email hello@tixcast.app from the address you signed in with, or send a request from Help and feedback.</p>
        </div>
      </Sheet>
    </Screen>
  )
}
