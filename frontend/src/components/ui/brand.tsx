import Link from 'next/link'

/** EzWill logo mark (document + sprout). Solid navy PNG; pass `invert` to flip
 *  it white on dark backgrounds (e.g. the footer). */
export function EzWillLogo({ className = '', invert = false }: { className?: string; invert?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/ezwill-logo.png"
      alt="EzWill"
      className={`${className} ${invert ? 'brightness-0 invert' : ''}`}
    />
  )
}

/** Logo + wordmark lockup, linking home by default. */
export function BrandLockup({ className = '', href = '/', invert = false }: { className?: string; href?: string | null; invert?: boolean }) {
  const color = invert ? 'text-white' : 'text-[#1B2A4A]'
  const inner = (
    <span className={`flex items-center gap-2 ${color} ${className}`}>
      <EzWillLogo className="h-8 w-8" invert={invert} />
      <span className="text-display text-xl font-bold">EzWill</span>
    </span>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}
