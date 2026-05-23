import {
  Header,
  Deck,
  Crossfader,
  TrackLibrary,
  ActionLog,
  HypeMeter,
  TransitionMeter,
  AIThinkingOverlay,
  KeyboardVisualizer,
} from './components';
import { useKeyboardMash } from './hooks/useKeyboardMash';

export default function App() {
  useKeyboardMash();

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-primary text-text-primary overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 flex-shrink-0 overflow-hidden">
          <TrackLibrary />
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex flex-1 gap-3 p-3 overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <Deck deckId="A" />
            </div>
            <div className="flex-1 overflow-y-auto">
              <Deck deckId="B" />
            </div>
          </div>

          <Crossfader />

          <div className="flex gap-3 p-3 h-44 flex-shrink-0">
            <div className="flex-1">
              <ActionLog />
            </div>
            <div className="flex-1">
              <KeyboardVisualizer />
            </div>
            <div className="w-28">
              <HypeMeter />
            </div>
            <div className="w-36">
              <TransitionMeter />
            </div>
          </div>
        </main>
      </div>

      <AIThinkingOverlay />
    </div>
  );
}
