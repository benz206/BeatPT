import { useAppStore } from '../stores/useAppStore';

export function Header() {
  const djName = useAppStore((s) => s.djName);
  const generateDJName = useAppStore((s) => s.generateDJName);
  const isMashMode = useAppStore((s) => s.isMashMode);
  const toggleMashMode = useAppStore((s) => s.toggleMashMode);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-bg-secondary border-b border-border border-b-amber-500/15">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">
          Beat<span className="text-accent">PT</span>
        </h1>
        <span className="text-[11px] text-text-muted font-medium">AI-Powered DJ</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={generateDJName}
          className="text-xs text-text-secondary font-medium px-3 py-1.5 rounded hover:text-text-primary hover:bg-bg-tertiary/50 transition-all duration-200 cursor-pointer"
          title="Click to regenerate"
        >
          {djName}
        </button>

        <button
          onClick={toggleMashMode}
          className={`text-xs font-medium px-3 py-1.5 rounded border transition-all duration-200 cursor-pointer ${
            isMashMode
              ? 'bg-accent/12 border-accent/30 text-accent'
              : 'bg-bg-tertiary border-border text-text-secondary hover:border-border-hover hover:text-text-primary'
          }`}
        >
          Mash Mode
        </button>
      </div>
    </header>
  );
}
