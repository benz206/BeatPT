import { AudioEngine } from './AudioEngine';
import { djActions, type DJAction, type MixPhase } from './DJActions';

interface CooldownEntry {
  conflictGroup: string;
  expiresAt: number;
}

const PHASE_THRESHOLDS: Record<MixPhase, [number, number]> = {
  groove: [5, 8],
  buildup: [4, 7],
  drop: [1, 2],
};

const NEXT_PHASE: Record<MixPhase, MixPhase> = {
  groove: 'buildup',
  buildup: 'drop',
  drop: 'groove',
};

export class ActionScheduler {
  private static instance: ActionScheduler | null = null;
  private phase: MixPhase = 'groove';
  private pressesInPhase = 0;
  private cooldowns: CooldownEntry[] = [];
  private lastActionName = '';
  private phaseTarget: number;

  private constructor() {
    this.phaseTarget = this.computeThreshold();
  }

  static getInstance(): ActionScheduler {
    if (!ActionScheduler.instance) {
      ActionScheduler.instance = new ActionScheduler();
    }
    return ActionScheduler.instance;
  }

  selectAndExecute(): DJAction | null {
    const engine = AudioEngine.getInstance();
    if (!engine.isPlaying('A') && !engine.isPlaying('B')) return null;

    this.pressesInPhase++;
    this.cleanExpired();
    this.maybeAdvancePhase();

    const candidates = djActions
      .filter(a => a.phases.includes(this.phase))
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
    return this.phase;
  }

  private computeThreshold(): number {
    const [min, max] = PHASE_THRESHOLDS[this.phase];
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private maybeAdvancePhase() {
    if (this.pressesInPhase < this.phaseTarget) return;

    this.phase = NEXT_PHASE[this.phase];
    this.pressesInPhase = 0;
    this.phaseTarget = this.computeThreshold();
  }

  private isBlocked(action: DJAction): boolean {
    return this.cooldowns.some(c => c.conflictGroup === action.conflictGroup);
  }

  private cleanExpired() {
    const now = Date.now();
    this.cooldowns = this.cooldowns.filter(c => c.expiresAt > now);
  }
}
