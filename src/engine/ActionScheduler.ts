import { AudioEngine } from './AudioEngine';
import { useAppStore } from '../stores/useAppStore';
import { djActions, type DJAction, type MixPhase } from './DJActions';
import { getCurrentSegment, type EnergySegmentType } from './EnergyAnalyzer';

interface CooldownEntry {
  conflictGroup: string;
  expiresAt: number;
}

function segmentToPhase(type: EnergySegmentType): MixPhase {
  switch (type) {
    case 'peak': return 'drop';
    case 'rising': return 'buildup';
    case 'falling': return 'groove';
    case 'low': return 'groove';
  }
}

export class ActionScheduler {
  private static instance: ActionScheduler | null = null;
  private cooldowns: CooldownEntry[] = [];
  private lastActionName = '';

  static getInstance(): ActionScheduler {
    if (!ActionScheduler.instance) {
      ActionScheduler.instance = new ActionScheduler();
    }
    return ActionScheduler.instance;
  }

  selectAndExecute(): DJAction | null {
    const engine = AudioEngine.getInstance();
    if (!engine.isPlaying('A') && !engine.isPlaying('B')) return null;

    this.cleanExpired();

    const phase = this.getPhase();
    const candidates = djActions
      .filter(a => a.phases.includes(phase))
      .filter(a => !this.isBlocked(a))
      .filter(a => a.name !== this.lastActionName);

    if (candidates.length === 0) return null;

    const action = candidates[Math.floor(Math.random() * candidates.length)];

    try {
      action.execute();
    } catch (err) {
      console.error('[ActionScheduler] action failed', err);
    }

    this.lastActionName = action.name;
    this.cooldowns.push({
      conflictGroup: action.conflictGroup,
      expiresAt: Date.now() + action.cooldown,
    });

    return action;
  }

  getPhase(): MixPhase {
    const engine = AudioEngine.getInstance();
    if (!engine.isPlaying('A') && !engine.isPlaying('B')) return 'groove';

    const deckId = this.getActiveDeckId();
    const state = useAppStore.getState();
    const deckState = deckId === 'A' ? state.deckA : state.deckB;
    const track = deckState.track;

    if (!track || !track.energySegments.length) return 'groove';

    const currentTime = engine.getPlaybackPosition(deckId);
    const segment = getCurrentSegment(track.energySegments, currentTime);
    if (!segment) return 'groove';

    return segmentToPhase(segment.type);
  }

  private getActiveDeckId(): 'A' | 'B' {
    const engine = AudioEngine.getInstance();
    if (engine.isPlaying('A') && !engine.isPlaying('B')) return 'A';
    if (engine.isPlaying('B') && !engine.isPlaying('A')) return 'B';
    return engine.getCrossfaderValue() <= 0 ? 'A' : 'B';
  }

  private isBlocked(action: DJAction): boolean {
    return this.cooldowns.some(c => c.conflictGroup === action.conflictGroup);
  }

  private cleanExpired() {
    const now = Date.now();
    this.cooldowns = this.cooldowns.filter(c => c.expiresAt > now);
  }
}
