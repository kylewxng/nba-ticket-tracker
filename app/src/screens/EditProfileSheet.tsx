import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { PrimaryButton, Sheet } from '@/components/kit'
import { useStore } from '@/lib/store'
import { Avatar } from './Home'

const NAME_RULE = /^[A-Za-z0-9._-]{2,30}$/

export function EditProfileSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { displayName, profile, updateProfile, uploadAvatar } = useStore()
  const [name, setName] = useState(displayName ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'photo' | 'save' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(displayName ?? '')
      setError(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const onPick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 15 * 1024 * 1024) return setError('That photo is over 15 MB. Pick a smaller one.')
    setError(null)
    setBusy('photo')
    const ok = await uploadAvatar(file)
    setBusy(null)
    if (ok) toast('Photo updated')
    if (fileRef.current) fileRef.current.value = ''
  }

  const onSave = async (e: FormEvent) => {
    e.preventDefault()
    const next = name.trim()
    if (!NAME_RULE.test(next)) {
      return setError('Use 2 to 30 letters, numbers, periods, dashes, or underscores. No spaces.')
    }
    setBusy('save')
    await updateProfile({ display_name: next })
    setBusy(null)
    toast('Profile saved')
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Edit profile">
      <form onSubmit={(e) => void onSave(e)} className="flex flex-col gap-5 pb-4" noValidate>
        <div className="flex items-center gap-4">
          <Avatar size={80} />
          <div className="flex flex-col items-start gap-1.5">
            <input ref={fileRef} id="avatar-file" type="file" accept="image/*" className="sr-only-safe" onChange={(e) => void onPick(e.target.files?.[0])} />
            <label htmlFor="avatar-file" className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#2A3858] px-4 text-[14px] font-semibold hover:bg-[#1E2B48]">
              <Camera size={16} aria-hidden="true" />
              {busy === 'photo' ? 'Uploading…' : profile.avatar_url ? 'Change photo' : 'Add a photo'}
            </label>
            {profile.avatar_url && (
              <button type="button" onClick={() => void updateProfile({ avatar_url: null })} className="h-8 text-[13px] font-semibold text-sub hover:text-ink">
                Remove photo
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="username" className="text-[13px] font-semibold text-sub">Username</label>
          <div className="flex h-[52px] items-center rounded-2xl border border-[#2A3858] bg-[#0E1626] px-4 focus-within:border-glacier">
            <span className="text-[16px] text-faint" aria-hidden="true">@</span>
            <input
              id="username"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s/g, ''))}
              maxLength={30}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!error}
              aria-describedby="username-help"
              className="h-full min-w-0 flex-1 bg-transparent pl-1 text-[16px] focus:outline-none"
            />
          </div>
          <p id="username-help" className={error ? 'm-0 text-[13px] font-semibold text-danger' : 'm-0 text-[12px] text-faint'}>
            {error ?? 'Shown on your profile. 2 to 30 letters, numbers, periods, dashes, or underscores.'}
          </p>
        </div>

        <PrimaryButton type="submit" disabled={busy !== null}>{busy === 'save' ? 'Saving…' : 'Save profile'}</PrimaryButton>
      </form>
    </Sheet>
  )
}
