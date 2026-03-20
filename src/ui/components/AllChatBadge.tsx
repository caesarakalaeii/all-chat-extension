import { InfinityLogo } from './InfinityLogo'

export function AllChatBadge({ size = 18, title }: { size?: number; title?: string }) {
  return (
    <span
      title={title}
      aria-label="All-Chat badge"
      style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
    >
      <InfinityLogo size={size} />
    </span>
  )
}
