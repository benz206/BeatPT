import {
  Header,
  Deck,
  Crossfader,
  TrackLibrary,
  ActionLog,
  TransitionMeter,
  AIThinkingOverlay,
} from './components';
import { useKeyboardMash } from './hooks/useKeyboardMash';
import { useAutoTransition } from './hooks/useAutoTransition';

export default function App() {
  useKeyboardMash();
  useAutoTransition();

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-primary text-text-primary overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-60 shrink-0 overflow-hidden">
          <TrackLibrary />
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex flex-1 gap-4 p-4 overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              <Deck deckId="A" />
            </div>
            <div className="flex-1 flex flex-col min-h-0">
              <Deck deckId="B" />
            </div>
          </div>

          <Crossfader />

          <div className="flex gap-3 p-4 h-52 shrink-0">
            <div className="flex-1">
              <ActionLog />
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
