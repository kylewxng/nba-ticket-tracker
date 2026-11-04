import { useState } from 'react'
import { BellRing, PlusSquare, Share } from 'lucide-react'
import { toast } from 'sonner'
import { PrimaryButton, Sheet } from '@/components/kit'
import { enablePush, pushState } from '@/lib/push'
import { useStore } from '@/lib/store'

/** Shown once, right after the first alert is saved: the moment notifications make sense. */
export function PushPrompt() {
  const { pushPromptOpen, setPushPromptOpen, session, updateProfile } = useStore()
  const [busy, setBusy] = useState(false)
  const state = pushPromptOpen ? pushState() : 'off'

  const onEnable = async () => {
    setBusy(true)
    const result = await enablePush(session?.user.id ?? null)
    setBusy(false)
    setPushPromptOpen(false)
    if (result === 'on') {
      void updateProfile({ notify_push: true })
      toast('Notifications on', { description: "We'll ping this device when your alert fires." })
    } else if (result === 'blocked') {
      toast('Notifications are blocked', { description: "Turn them on for this site in your browser settings. We'll email you until then." })
    }
  }

  if (state === 'on') return null

  return (
    <Sheet
      open={pushPromptOpen}
      onOpenChange={setPushPromptOpen}
      title={state === 'needs-install' ? 'Add Tixcast to your Home Screen' : 'Get alerts on this device'}
      description={state === 'needs-install' ? 'iPhone only sends web app notifications to apps on your Home Screen. It takes 10 seconds.' : 'Prices can move fast close to tip-off. A notification reaches you quicker than email.'}
    >
      <div className="flex flex-col gap-4 pb-4">
        {state === 'needs-install' ? (
          <ol className="m-0 flex list-none flex-col gap-3 rounded-2xl bg-inset p-4 text-[15px]">
            <li className="flex items-center gap-3"><Share size={20} className="flex-none text-link" aria-hidden="true" /><span>Tap <strong>Share</strong> in Safari's toolbar</span></li>
            <li className="flex items-center gap-3"><PlusSquare size={20} className="flex-none text-link" aria-hidden="true" /><span>Choose <strong>Add to Home Screen</strong></span></li>
            <li className="flex items-center gap-3"><BellRing size={20} className="flex-none text-link" aria-hidden="true" /><span>Open Tixcast from your Home Screen and turn on notifications in Profile</span></li>
          </ol>
        ) : state === 'unsupported' || state === 'blocked' ? (
          <p className="m-0 rounded-2xl bg-inset p-4 text-[15px] leading-[1.5]">
            {state === 'blocked' ? 'Notifications are blocked for Tixcast in this browser. ' : "This browser can't receive notifications. "}
            We'll email your alerts instead.
          </p>
        ) : (
          <PrimaryButton onClick={() => void onEnable()} disabled={busy}>{busy ? 'Turning on…' : 'Turn on notifications'}</PrimaryButton>
        )}
        <button type="button" onClick={() => setPushPromptOpen(false)} className="h-11 text-[15px] font-semibold text-sub">
          {state === 'off' ? 'Email me instead' : 'Got it'}
        </button>
      </div>
    </Sheet>
  )
}
