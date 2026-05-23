import { useState, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useFileImport } from '../hooks/useFileImport';
import type { Track } from '../stores/useAppStore';

export function TrackLibrary() {
  const library = useAppStore((s) => s.library);
  const { importFiles, isImporting: isLoading } = useFileImport();
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  const handleImport = useCallback(() => {
    importFiles();
  }, [importFiles]);

  const handleLoadToDeck = useCallback(
    async (track: Track, deck: 'A' | 'B') => {
      if (track.audioBuffer) {
        const { AudioEngine } = await import('../engine/AudioEngine');
        AudioEngine.getInstance().loadTrack(deck, track.audioBuffer);
        useAppStore.getState().loadTrackToDeck(deck, track);
      }
      setSelectedTrackId(null);
    },
    []
  );

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-bg-secondary border-r border-white/5">
      <div className="px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-black uppercase tracking-widest text-text-secondary">
            Library
          </span>
          <span className="text-xs text-text-secondary">{library.length}</span>
        </div>
        <button
          onClick={handleImport}
          disabled={isLoading}
          className="w-full py-2 text-xs font-semibold rounded-lg bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-all duration-200 disabled:opacity-50"
        >
          {isLoading ? 'Loading…' : '+ Import Tracks'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {library.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <span className="text-2xl">🎵</span>
            <p className="text-xs text-text-secondary leading-relaxed">
              Drop MP3s here or click Import
            </p>
          </div>
        ) : (
          <ul className="py-2">
            {library.map((track) => (
              <li key={track.id}>
                <button
                  onClick={() =>
                    setSelectedTrackId(selectedTrackId === track.id ? null : track.id)
                  }
                  className={`w-full text-left px-3 py-2.5 transition-all duration-150 border-l-2 ${
                    selectedTrackId === track.id
                      ? 'bg-bg-tertiary border-accent'
                      : 'border-transparent hover:bg-bg-tertiary/50 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-text-secondary text-xs mt-0.5">⠿</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate">
                        {track.name}
                      </p>
                      <p className="text-[10px] text-text-secondary truncate">
                        {track.artist}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-accent">
                          {Math.round(track.bpm)} BPM
                        </span>
                        <span className="text-[10px] text-text-secondary">
                          {formatDuration(track.duration)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {selectedTrackId === track.id && (
                  <div className="flex gap-2 px-3 pb-2">
                    <button
                      onClick={() => handleLoadToDeck(track, 'A')}
                      className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-accent/10 border border-accent/40 text-accent hover:bg-accent/20 transition-all duration-150"
                    >
                      → Deck A
                    </button>
                    <button
                      onClick={() => handleLoadToDeck(track, 'B')}
                      className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-accent-2/10 border border-accent-2/40 text-accent-2 hover:bg-accent-2/20 transition-all duration-150"
                    >
                      → Deck B
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
