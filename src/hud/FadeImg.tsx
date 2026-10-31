import React, { useRef, useState } from 'react'

/* <img> that fades in (opacity ONLY — no zoom; fade + scale together read as
   a camera push, which Reza rejected) the FIRST time a given src loads on the
   page. Images revisit on view switches remount the tree, but the src is in
   cache by then — those render immediately with no animation at all. The
   fade plays once per src, ever. `filter` transitions ride along untouched
   (never touches filter itself, so per-caller filter styles keep working). */
const everLoaded = new Set<string>()

export const FadeImg: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({
  style,
  src,
  ...rest
}) => {
  const ref = useRef<HTMLImageElement>(null)
  // Captured ONCE at mount: recomputing from everLoaded after the load lands
  // would flip this false and strip the transition style MID-FADE (the fade
  // never played). A revisit starts plain — no opacity, no transition.
  const [animate] = useState(() => !!src && !everLoaded.has(src))
  const [loaded, setLoaded] = useState(false)

  const markLoaded = () => {
    if (src) everLoaded.add(src)
    setLoaded(true)
  }

  return (
    <img
      ref={(el) => {
        ref.current = el
        // Cached-but-first-seen images can already be complete before the
        // load event lands — catch those in the attach callback so they fade
        // instead of sticking at opacity 0 forever
        if (el?.complete && el.naturalWidth > 0) markLoaded()
      }}
      decoding="async"
      src={src}
      style={
        animate
          ? {
              ...style,
              opacity: loaded ? 1 : 0,
              transition: 'opacity 0.5s ease-out, filter 0.2s ease-out',
            }
          : style
      }
      onLoad={markLoaded}
      {...rest}
    />
  )
}
