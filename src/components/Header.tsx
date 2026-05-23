export function Header() {
  return (
    <header className="flex items-center px-6 py-3 bg-bg-secondary border-b border-border border-b-amber-500/15">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">
          Beat<span className="text-accent">PT</span>
        </h1>
        <span className="text-[11px] text-text-muted font-medium">AI-Powered DJ</span>
      </div>
    </header>
  );
}
