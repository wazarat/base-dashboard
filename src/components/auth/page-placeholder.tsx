/**
 * Grey card shapes standing in for a gated page while it is locked or loading. They
 * carry no data at all, so a logged-out visitor's page holds nothing gated (owner
 * prompt, login wall phase 2).
 */
function Block({ className }: { className: string }) {
  return <div className={`rounded-xl border border-ink-700/60 bg-ink-900 ${className}`} aria-hidden />;
}

export function PagePlaceholder({ label = "Loading" }: { label?: string }) {
  return (
    <div className="space-y-4" data-testid="page-placeholder" aria-busy="true" aria-label={label}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-24 animate-pulse" />
        ))}
      </div>
      <Block className="h-72 animate-pulse" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Block className="h-56 animate-pulse" />
        <Block className="h-56 animate-pulse" />
      </div>
    </div>
  );
}
