import { Sheet } from '@/components/kit'
import { VerdictPill } from '@/components/kit'

export function HowItWorksSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="How forecasts work">
      <div className="flex flex-col gap-4 pb-4 text-[15px] leading-[1.55] text-[#C9D2E3]">
        <p className="m-0">
          Tixcast checks resale prices for every Lakers and Clippers home game several times a day. For each game it looks at how the cheapest ticket has moved, how many seats are listed, the day and opponent, national TV, and the injury report.
        </p>
        <div className="flex flex-col gap-3 rounded-2xl bg-inset p-4">
          <div className="flex items-start gap-3"><VerdictPill verdict="buy" /><p className="m-0 text-[14px]">The price is near its low and the signs point up. Waiting will probably cost you.</p></div>
          <div className="flex items-start gap-3"><VerdictPill verdict="wait" /><p className="m-0 text-[14px]">More seats are coming onto the market or demand is soft. The price will probably drop.</p></div>
          <div className="flex items-start gap-3"><VerdictPill verdict="watch" /><p className="m-0 text-[14px]">No clear direction yet. Set an alert and we'll tell you when that changes.</p></div>
        </div>
        <p className="m-0">
          Right now the calls come from simple rules based on how resale prices usually behave. A forecast model is training on this season's games and replaces the rules only once it proves more accurate on games it hasn't seen.
        </p>
        <p className="m-0 text-[13px] text-sub">
          Odds are estimates, not guarantees. Prices shown are the cheapest single ticket we found; your total at checkout depends on the seller's fees.
        </p>
      </div>
    </Sheet>
  )
}
