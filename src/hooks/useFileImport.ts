import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { analyzeTrackFile } from '../engine/TrackAnalyzer';

export function useFileImport() {
  const [isImporting, setIsImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const addTrack = useAppStore((state) => state.addTrack);

  function getOrCreateInput(): HTMLInputElement {
    if (inputRef.current) return inputRef.current;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    inputRef.current = input;
    return input;
  }

  async function processFile(file: File): Promise<void> {
    const track = await analyzeTrackFile(file);
    addTrack(track);
  }

  const importFiles = useCallback(() => {
    const input = getOrCreateInput();

    input.onchange = async () => {
      const files = input.files;
      if (!files || files.length === 0) return;

      setIsImporting(true);
      try {
        await Promise.all(Array.from(files).map(processFile));
      } finally {
        setIsImporting(false);
        input.value = '';
      }
    };

    input.click();
  }, [addTrack]);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('audio/')
      );
      if (files.length === 0) return;

      setIsImporting(true);
      try {
        await Promise.all(files.map(processFile));
      } finally {
        setIsImporting(false);
      }
    },
    [addTrack]
  );

  return { importFiles, isImporting, onDrop };
}
