import { useEffect, useState } from 'react';
import { AudioEngine } from '../engine/AudioEngine';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function saveBlob(blob: Blob, filename: string): Promise<void> {
  // WKWebView doesn't honor anchor downloads, so use the native save dialog in Tauri
  if ('__TAURI_INTERNALS__' in window) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: filename });
    if (path) {
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function Header() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRecording) return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  const toggleRecording = async () => {
    const engine = AudioEngine.getInstance();
    if (!isRecording) {
      engine.startRecording();
      setElapsed(0);
      setIsRecording(true);
    } else {
      setIsRecording(false);
      const blob = await engine.stopRecording();
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const filename = `beatpt-mix-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
      await saveBlob(blob, filename);
    }
  };

  return (
    <header className="flex items-center px-6 py-3 bg-bg-secondary border-b border-border border-b-amber-500/15">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">
          Beat<span className="text-accent">PT</span>
        </h1>
        <span className="text-[11px] text-text-muted font-medium">AI-Powered DJ</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {isRecording && (
          <span className="text-[11px] font-mono text-text-secondary">{formatElapsed(elapsed)}</span>
        )}
        <button
          onClick={toggleRecording}
          title={isRecording ? 'Stop recording and save the mix' : 'Record the master output'}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded border transition-all duration-150 cursor-pointer ${
            isRecording
              ? 'border-red-500/50 bg-red-500/15 text-red-400'
              : 'border-border text-text-muted hover:border-border-hover hover:text-text-secondary'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-red-500/50'}`}
          />
          {isRecording ? 'STOP' : 'REC'}
        </button>
      </div>
    </header>
  );
}
