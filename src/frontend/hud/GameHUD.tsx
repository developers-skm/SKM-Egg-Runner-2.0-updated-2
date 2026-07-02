import React from 'react';
import { HudSnapshot } from '../../types';
import { Pause } from 'lucide-react';
import { soundManager } from '../../audio';
import { HUDFastStats } from './HUDFastStats';

interface GameHUDProps {
  speed: number;
  onPause: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onJump: () => void;
  onSlide: () => void;
  debugHitboxes?: boolean;
  onToggleDebugHitboxes?: () => void;
  subscribe: (cb: (snap: HudSnapshot) => void) => () => void;
  brownEggsLaid?: number;
  brownEggsCollected?: number;
  isStage2?: boolean;
  stage1EvolutionReq?: number;
  stage2EvolutionReq?: number;
}

// Static shell: only re-renders on real state transitions (pause toggles,
// stage2 flips, evolution requirement changes from live config) — the 60fps
// score/distance/stage/power-up updates are handled entirely inside
// HUDFastStats via a direct engine subscription, bypassing this component.
const GameHUDInner: React.FC<GameHUDProps> = ({
  onPause,
  subscribe,
  debugHitboxes = false,
  brownEggsLaid = 0,
  brownEggsCollected = 0,
  isStage2 = false,
  stage1EvolutionReq = 100,
  stage2EvolutionReq = 500
}) => {
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-between p-4 pointer-events-none select-none">

      <HUDFastStats
        subscribe={subscribe}
        brownEggsLaid={brownEggsLaid}
        brownEggsCollected={brownEggsCollected}
        isStage2={isStage2}
        stage1EvolutionReq={stage1EvolutionReq}
        stage2EvolutionReq={stage2EvolutionReq}
      />

      {/* Top HUD: Pause trigger (stats panel lives inside HUDFastStats) */}
      <div className="flex justify-end items-start w-full pointer-events-none">
        <div className="flex items-center gap-2 responsive-hud-right pointer-events-auto">
          <button
            id="btn_pause_game"
            onClick={() => { soundManager.playClick(); onPause(); }}
            className="bg-slate-900/95 hover:bg-slate-800 border border-slate-800 transition cursor-pointer pointer-events-auto shadow-xl flex items-center justify-center active:scale-90"
            style={{ width: 56, height: 56, borderRadius: 16 }}
            title="Pause Game"
          >
            <Pause style={{ width: 22, height: 22 }} className="text-white fill-current" />
          </button>
        </div>
      </div>

      {/* Unobstructed Center Spacer Area */}
      <div className="flex-1 w-full" />

    </div>
  );
};

export const GameHUD = React.memo(GameHUDInner);
export default GameHUD;
