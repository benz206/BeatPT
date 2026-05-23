import { useState, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useFileImport } from '../hooks/useFileImport';
import { Label, Button } from './ui';
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
    <div className="flex flex-col h-full bg-bg-secondary border-r border-border">
      <div className="border-b border-border">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <Label>Library</Label>
          <span className="text-[11px] text-text-muted font-medium">{library.length}</span>
        </div>
        <div className="px-4 pb-4">
          <Button
            onClick={handleImport}
            disabled={isLoading}
            variant="secondary"
            size="sm"
            className="w-full"
          >
            {isLoading ? 'Loading…' : '+ Import Tracks'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {library.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-border flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Drop audio files here or click Import
            </p>
          </div>
        ) : (
          <ul className="py-1">
            {library.map((track) => (
              <li key={track.id}>
                <button
                  onClick={() => setSelectedTrackId(selectedTrackId === track.id ? null : track.id)}
                  className={`w-full text-left px-4 py-2.5 transition-all duration-150 border-l-2 cursor-pointer ${
                    selectedTrackId === track.id
                      ? 'bg-bg-tertiary/80 border-accent'
                      : 'border-transparent hover:bg-bg-tertiary/40'
                  }`}
                >
                  <p className="text-xs font-medium text-text-primary truncate">{track.name}</p>
                  <p className="text-[11px] text-text-secondary truncate">{track.artist}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-mono text-accent">{Math.round(track.bpm)} BPM</span>
                    <span className="text-[11px] text-text-muted">{formatDuration(track.duration)}</span>
                  </div>
                </button>

                {selectedTrackId === track.id && (
                  <div className="flex gap-2 mx-3 mb-2">
                    <button
                      onClick={() => handleLoadToDeck(track, 'A')}
                      className="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-accent-subtle border border-accent/20 text-accent hover:bg-accent-muted transition-all duration-150 cursor-pointer"
                    >
                      Deck A
                    </button>
                    <button
                      onClick={() => handleLoadToDeck(track, 'B')}
                      className="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-accent-2-subtle border border-accent-2/20 text-accent-2 hover:bg-accent-2-muted transition-all duration-150 cursor-pointer"
                    >
                      Deck B
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
