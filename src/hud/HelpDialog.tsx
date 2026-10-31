import React from 'react'
import { TerminalDialog } from './TerminalDialog'

// Module-level (react-compiler: no components created during render)
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-1">
    <h3 className="font-display text-sm font-semibold text-core uppercase tracking-wider">
      {title}
    </h3>
    <div className="text-base text-ice/80 font-sans leading-relaxed space-y-1">{children}</div>
  </div>
)

/** Grid Battle rules & controls, mounted three ways: the ? HUD toggle while
    waiting for a challenger, the joiner's challenge screen, and the result
    dialog before a rematch. Renders through the shared TerminalDialog shell
    (bare "How to Play" title, no Terminal tag). Opening it NEVER pauses the
    duel — mid-game reading is the rider's risk. */
export const HelpDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  // Same breakpoint as the ride HUD's isMobile flag (≤1024): tablets and
  // phones see the touch controls, desktop the keyboard ones — never both
  const isTouch = typeof window !== 'undefined' && window.innerWidth <= 1024

  return (
    <TerminalDialog
      title="How to Play"
      tag={null}
      ariaLabel="How to play"
      onClose={onClose}
      isMobile={isTouch}
    >
      <div className="space-y-5">
        <Section title="The Grid Battle">
          <p>
            Out-ride and out-trap. Both light cycles drive forward nonstop; you control steering,
            boost, and drift. Neither bike can stop or reverse.
          </p>
        </Section>
        <Section title="Light Ribbons">
          <p>
            Holding boost lays a solid light wall behind you. Every ribbon is solid, yours and your
            opponent&apos;s alike. Plough into a ribbon at boost speed and you derezz instantly; a
            slower touch bounces you off and hands the ribbon&apos;s owner a point.
          </p>
          <p>
            Arena walls never derezz you, but every wall touch hands your opponent a point, so keep
            clear of the edges.
          </p>
        </Section>
        <Section title="Fuel & Canisters">
          <p>
            Boost drains fuel, your ribbon-length budget. It refills while you ride without
            boosting; running it empty locks boost until it recovers on its own. Glowing canisters
            permanently grow your tank, so ride through their light to collect.
          </p>
        </Section>
        <Section title="Keep Moving">
          <p>
            Stop making progress and your bike gets flipped around to carry you free. Wall grinding
            pays your opponent; leaning on drift too long overheats the tyres and locks drift for a
            while. Keep riding forward.
          </p>
        </Section>
        <Section title="Winning">
          <p>
            Make your opponent derezz into any ribbon, or lead on points when the clock runs out. A
            disconnecting opponent forfeits the Grid Battle.
          </p>
        </Section>
        <Section title="Controls">
          {/* One column for the current input mode only — no mode label
              needed since the other never shows */}
          <div className="space-y-1 font-mono text-sm">
            {isTouch ? (
              <>
                <p>Left pad: steer</p>
                <p>Slide past the pad edge: boost (lays ribbon)</p>
                <p>Drift pedal + pad: drift</p>
              </>
            ) : (
              <>
                <p>A / D or ← / →: steer</p>
                <p>Shift: boost (lays ribbon)</p>
                <p>Space + steer: drift</p>
              </>
            )}
          </div>
        </Section>
      </div>
    </TerminalDialog>
  )
}
