import { useAppStore } from '../stores/useAppStore';

export function Header() {
  const djName = useAppStore((s) => s.djName);
  const generateDJName = useAppStore((s) => s.generateDJName);
  const isMashMode = useAppStore((s) => s.isMashMode);
  const toggleMashMode = useAppStore((s) => s.toggleMashMode);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-bg-secondary border-b border-white/5">
      <div className="flex items-center gap-3">
        <h1
          className="text-2xl font-black tracking-tight"
          style={{ background: 'linear-gradient(90deg, #e040fb, #00e5ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          BeatPT
        </h1>
        <span className="text-xs text-text-secondary uppercase tracking-wider">AI-Powered DJ</span>
      </div>

      <button
        onClick={generateDJName}
        className="text-sm text-text-primary font-semibold px-3 py-1 rounded-lg bg-bg-tertiary border border-white/10 hover:border-accent/40 transition-all duration-200"
        title="Click to regenerate"
      >
        {djName}
      </button>

      <button
        onClick={toggleMashMode}
        className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all duration-200 border ${
          isMashMode
            ? 'bg-accent/20 border-accent text-accent shadow-[0_0_16px_#e040fb66]'
            : 'bg-bg-tertiary border-white/10 text-text-secondary hover:border-accent/40 hover:text-accent'
        }`}
      >
        MASH MODE
      </button>
    </header>
  );
}
