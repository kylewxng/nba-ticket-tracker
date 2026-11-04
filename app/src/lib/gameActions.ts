import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { money } from './format'
import { useStore } from './store'
import { matchup } from './teams'
import type { Game } from './types'

/** Watch, alert and share for one game, with the sign-in step built in. */
export function useGameActions(game: Game | undefined) {
  const navigate = useNavigate()
  const { watches, toggleWatch, signedIn, openSignIn, alertFor } = useStore()
  if (!game) return null
  const title = matchup(game)
  return {
    watching: watches.has(game.game_id),
    alert: alertFor(game.game_id),
    onWatch: () => {
      if (!signedIn) return openSignIn('Sign in to keep this game on Home and hear when its price moves.', { type: 'watch', gameId: game.game_id })
      void toggleWatch(game.game_id)
    },
    onAlert: () => {
      if (!signedIn) return openSignIn('Sign in so we can tell you when this game hits your price.', { type: 'alert', gameId: game.game_id })
      navigate(`/game/${game.game_id}/alert`)
    },
    onShare: async () => {
      const url = window.location.href.replace(/\/alert$/, '')
      const text = game.price_now != null ? `${title}: ${money(game.price_now)} right now. Tixcast says ${game.verdict === 'buy' ? 'buy now' : game.verdict}.` : title
      try {
        if (navigator.share) await navigator.share({ title, text, url })
        else {
          await navigator.clipboard.writeText(url)
          toast('Link copied')
        }
      } catch {
        /* share sheet closed */
      }
    },
  }
}
