import { useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Page } from '@/components/desktop'
import { Switch } from '@/components/kit'
import { enablePush, pushState, type PushState } from '@/lib/push'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { EditProfileSheet } from '../EditProfileSheet'
import { FeedbackSheet } from '../FeedbackSheet'
import { Avatar } from '../Home'
import { HowItWorksSheet } from '../HowItWorks'
import { PrivacySheet } from '../Profile'

const PUSH_COPY: Record<PushState, string> = {
  on: 'On for this browser',
  off: 'Off in this browser',
  blocked: 'Blocked in your browser settings',
  'needs-install': 'Add Tixcast to your Home Screen first',
  unsupported: "This browser can't get notifications",
}

/** One settings group: what it is on the left, the controls on the right. */
function Group({ title, about, children }: { title: string; about: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[260px_minmax(0,1fr)] gap-10 border-t border-[#1B2743] py-8">
      <div>
        <h2 className="m-0 text-[16px] font-bold">{title}</h2>
        <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-sub">{about}</p>
      </div>
      <div className="overflow-hidden rounded-[16px] border border-[#1B2743] bg-[#131D33]">{children}</div>
    </section>
  )
}

function Row({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[64px] items-center justify-between gap-6 border-b border-[#1B2743] px-5 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="m-0 text-[15px]">{label}</p>
        {detail && <p className="m-0 mt-0.5 text-[12px] text-sub">{detail}</p>}
      </div>
      {children}
    </div>
  )
}

export function ProfileDesktop() {
  const { profile, updateProfile, displayName, email, signedIn, demo, session, signOut, openSignIn, watches, alerts, events } = useStore()
  const [push, setPush] = useState<PushState>(() => pushState())
  const [sheet, setSheet] = useState<'how' | 'privacy' | 'feedback' | 'edit' | null>(null)
  const name = signedIn ? displayName || (demo ? 'Demo mode' : 'You') : 'Not signed in'
  const since = session?.user.created_at ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(session.user.created_at)) : null

  const toggleTeam = (id: string) => {
    const has = profile.teams.includes(id)
    if (has && profile.teams.length === 1) return toast('Keep at least one team', { description: 'Home picks its best call from your teams.' })
    void updateProfile({ teams: has ? profile.teams.filter((t) => t !== id) : [...profile.teams, id] })
  }
  const onPush = async () => {
    const r = await enablePush(session?.user.id ?? null)
    setPush(r)
    if (r === 'on') void updateProfile({ notify_push: true })
  }

  return (
    <Page className="max-w-[960px]">
      <div className="flex items-center gap-5 pb-8">
        <Avatar size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display m-0 truncate text-[44px] font-extrabold leading-none">{name}</h1>
          <p className="m-0 mt-1.5 text-[14px] text-sub">
            {demo ? 'Sample games. Your choices stay in this browser.' : signedIn ? `${email ?? ''}${since ? `, member since ${since}` : ''}` : 'Sign in to save games and get alerts on any device.'}
          </p>
        </div>
        {profile.founding_member && !demo && <span className="rounded-md bg-[#3A3022] px-2.5 py-1 text-[13px] font-bold text-[#E3B87C]">Founding member</span>}
        {signedIn && (
          <button type="button" onClick={() => setSheet('edit')} className="h-11 rounded-xl border border-[#2A3858] px-5 text-[14px] font-semibold hover:bg-[#16213A]">Edit profile</button>
        )}
        {!signedIn ? (
          <button type="button" onClick={() => openSignIn()} className="primary-fill h-11 rounded-xl px-5 text-[14px] font-bold">Sign in</button>
        ) : !demo ? (
          <button type="button" onClick={() => void signOut()} className="h-11 rounded-xl border border-[#3A2A2A] px-5 text-[14px] font-semibold text-danger">Sign out</button>
        ) : null}
      </div>

      <dl className="m-0 grid grid-cols-3 gap-6 rounded-[16px] border border-[#1B2743] bg-[#131D33] px-6 py-5">
        {[[watches.size, "Games you're watching"], [alerts.filter((a) => a.active).length, 'Alerts on'], [events.length, 'Alerts ready']].map(([n, l]) => (
          <div key={String(l)}>
            <dt className="text-[13px] text-sub">{l}</dt>
            <dd className="font-display tabular m-0 mt-1 text-[40px] font-black leading-none">{n}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8">
        <Group title="Your teams" about="Home picks its best call from these teams' games.">
          <Row label="Teams">
            <div className="flex gap-2">
              {[['LAL', 'Lakers'], ['LAC', 'Clippers']].map(([id, label]) => {
                const on = profile.teams.includes(id)
                return (
                  <button key={id} type="button" aria-pressed={on} onClick={() => toggleTeam(id)} className={cn('h-9 rounded-full border px-4 text-[14px] font-semibold', on ? 'glacier border-transparent' : 'border-[#2A3858] text-sub hover:text-ink')}>
                    {label}
                  </button>
                )
              })}
            </div>
          </Row>
        </Group>

        <Group title="Tickets" about="Prices show per ticket, with a total for this many on each game.">
          <Row label="How many you usually buy">
            <div className="flex items-center gap-2" role="group" aria-label="Ticket count">
              <button type="button" aria-label="Fewer tickets" disabled={profile.ticket_count <= 1} onClick={() => void updateProfile({ ticket_count: profile.ticket_count - 1 })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0E1626] disabled:opacity-40"><Minus size={16} aria-hidden="true" /></button>
              <span className="tabular w-6 text-center text-[16px] font-bold" aria-live="polite">{profile.ticket_count}</span>
              <button type="button" aria-label="More tickets" disabled={profile.ticket_count >= 8} onClick={() => void updateProfile({ ticket_count: profile.ticket_count + 1 })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0E1626] disabled:opacity-40"><Plus size={16} aria-hidden="true" /></button>
            </div>
          </Row>
        </Group>

        <Group title="Notifications" about="How alerts reach you. Email is the backup when a notification can't.">
          <Row label="Browser notifications" detail={PUSH_COPY[push]}>
            {push === 'on' ? <span className="text-[13px] font-semibold text-link">On</span> : push === 'off' ? <button type="button" onClick={() => void onPush()} className="primary-fill h-9 rounded-full px-4 text-[13px] font-bold">Turn on</button> : null}
          </Row>
          <Row label="Email alerts" detail={email ? `Sent to ${email}` : 'Sign in to get alerts by email'}>
            <Switch on={profile.notify_email} onChange={(v) => void updateProfile({ notify_email: v })} label="Email alerts" disabled={!signedIn} />
          </Row>
          <Row label="Weekly best calls" detail="Sunday email with your teams' best games">
            <Switch on={profile.weekly_digest} onChange={(v) => void updateProfile({ weekly_digest: v })} label="Weekly best calls" disabled={!signedIn} />
          </Row>
        </Group>

        <Group title="Help" about="How the calls are made, what we store, and a direct line to Kyle.">
          {([['How Tixcast forecasts work', 'how'], ['Privacy and data', 'privacy'], ['Help and feedback', 'feedback']] as const).map(([label, id]) => (
            <button key={id} type="button" onClick={() => setSheet(id)} className="flex min-h-[56px] w-full items-center justify-between border-b border-[#1B2743] px-5 text-left text-[15px] last:border-b-0 hover:bg-[#16213A]">
              {label}<span className="text-[13px] font-semibold text-link">Open</span>
            </button>
          ))}
        </Group>
      </div>

      <p className="m-0 mt-4 text-[12px] text-faint">Tixcast isn't affiliated with the NBA, its teams, or any ticket marketplace.</p>

      <HowItWorksSheet open={sheet === 'how'} onOpenChange={(o) => !o && setSheet(null)} />
      <PrivacySheet open={sheet === 'privacy'} onOpenChange={(o) => !o && setSheet(null)} />
      <FeedbackSheet open={sheet === 'feedback'} onOpenChange={(o) => !o && setSheet(null)} />
      <EditProfileSheet open={sheet === 'edit'} onOpenChange={(o) => !o && setSheet(null)} />
    </Page>
  )
}
