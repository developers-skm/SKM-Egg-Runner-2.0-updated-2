import React from 'react';
import { PowerUpType, PowerUpState, ThemeType } from '../../types';
import { Pause, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Shield, RefreshCw } from 'lucide-react';
import { soundManager } from '../../audio';

interface GameHUDProps {
  score: number;
  feedsCollected: number;
  gemsCollected: number;
  distance: number;
  speed: number;
  activePowerUps: { type: PowerUpType; timeLeft: number; duration: number }[];
  onPause: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onJump: () => void;
  onSlide: () => void;
  fps?: number;
  debugHitboxes?: boolean;
  onToggleDebugHitboxes?: () => void;
  currentStage?: 'EGG' | 'CHICK' | 'ADULT';
  grainsCollected?: number;
  isNearCornerTurn?: boolean;
  cornerTurnDirection?: 'LEFT' | 'RIGHT' | 'T_JUNCTION';
  isNearGate?: boolean;
  isHatching?: boolean;
  brownEggsLaid?: number;
  brownEggsCollected?: number;
  isStage2?: boolean;
  stage1EvolutionReq?: number;
  stage2EvolutionReq?: number;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  score,
  feedsCollected,
  gemsCollected,
  distance,
  speed,
  activePowerUps,
  onPause,
  onSwipeLeft,
  onSwipeRight,
  onJump,
  onSlide,
  fps = 60,
  debugHitboxes = false,
  onToggleDebugHitboxes,
  currentStage = 'EGG',
  grainsCollected = 0,
  isNearCornerTurn = false,
  cornerTurnDirection = 'T_JUNCTION',
  isNearGate = false,
  isHatching = false,
  brownEggsLaid = 0,
  brownEggsCollected = 0,
  isStage2 = false,
  stage1EvolutionReq = 100,
  stage2EvolutionReq = 500
}) => {
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-between p-4 pointer-events-none select-none">

      {/* Evolution Stage Indicator & Progress Bar */}
      <div className="absolute top-18 left-1/2 pointer-events-auto flex flex-col items-center gap-1 bg-slate-900/95 border border-slate-800 backdrop-blur shadow-2xl responsive-hud-center" style={{ width: 180, height: 60, borderRadius: 16, padding: '8px 12px', transform: 'translateX(-50%)' }}>
        <div className="flex items-center gap-1">
          <span style={{ fontSize: 18 }}>
            {isStage2 ? '🥚' : currentStage === 'EGG' ? '🥚' : currentStage === 'CHICK' ? '🐥' : '🏆'}
          </span>
          <span className="font-black text-amber-300 font-mono tracking-wider leading-none uppercase" style={{ fontSize: 14 }}>
            {isStage2 ? 'EXTREME MODE' : currentStage === 'EGG' ? 'EGG STAGE' : currentStage === 'CHICK' ? 'CHICK STAGE' : 'CHAMPION'}
          </span>
        </div>

        {isStage2 ? (
          <div className="flex flex-col items-center w-full mt-0.5">
            <div className="w-full bg-slate-800/85 h-1 rounded-full overflow-hidden border border-slate-700/50">
              <div
                className="h-full bg-gradient-to-r from-amber-600 to-yellow-600 transition-all duration-300"
                style={{ width: `${Math.min(100, (grainsCollected / stage1EvolutionReq) * 100)}%` }}
              />
            </div>
            <span className="text-[6px] font-bold font-mono text-slate-400 mt-0.5 uppercase tracking-wider">
              {currentStage}: {grainsCollected}/{stage1EvolutionReq} GROW
            </span>
          </div>
        ) : currentStage !== 'ADULT' ? (
          <div className="flex flex-col items-center w-full mt-0.5">
            <div className="w-full bg-slate-850 h-1 rounded-full overflow-hidden border border-slate-750">
              <div
                className={`h-full bg-gradient-to-r ${currentStage === 'EGG' ? 'from-amber-400 to-yellow-300' : 'from-emerald-400 to-cyan-300'} transition-all duration-300`}
                style={{ width: `${Math.min(100, (grainsCollected / stage1EvolutionReq) * 100)}%` }}
              />
            </div>
            <span className="text-[6px] font-bold font-mono text-slate-400 mt-0.5 uppercase tracking-wider">
              {grainsCollected}/{stage1EvolutionReq} GRAINS
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full mt-0.5">
            {brownEggsLaid > 0 ? (
              <>
                <div className="w-full bg-slate-800/85 h-1 rounded-full overflow-hidden border border-slate-700/50 animate-pulse">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-500 to-amber-650 transition-all duration-300"
                    style={{ width: `${Math.min(100, (brownEggsLaid / 50) * 100)}%` }}
                  />
                </div>
                <span className="text-[6px] font-black font-mono text-amber-400 mt-0.5 uppercase tracking-wider animate-pulse">
                  🥚 LAYING EGGS: {brownEggsLaid}/50
                </span>
              </>
            ) : (
              <>
                <div className="w-full bg-slate-800/8c h-1 rounded-full overflow-hidden border border-slate-700/40">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, (grainsCollected / stage2EvolutionReq) * 100)}%` }}
                  />
                </div>
                <span className="text-[6px] font-black font-mono text-emerald-400 mt-0.5 uppercase tracking-wider">
                  🌾 STAGE 2 REACH: {grainsCollected}/{stage2EvolutionReq}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Full Screen Widescreen Cinematic Letterboxing (No blocking central cards!) */}
      {isHatching && (
        <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between">
          {/* Top Black Bar */}
          <div className="w-full h-14 bg-slate-950/95 border-b border-amber-500/20 flex items-center justify-center shadow-lg transition-transform duration-500">
            <span className="text-xs font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-300 font-mono uppercase">
              {currentStage === 'CHICK'
                ? "✨ METAMORPHOSIS IN PROGRESS: CHICK ASCENSION ✨"
                : "✨ METAMORPHOSIS IN PROGRESS: EGG DETONATION ✨"}
            </span>
          </div>

          {/* Bottom Black Bar */}
          <div className="w-full h-14 bg-slate-950/95 border-t border-amber-500/20 flex items-center justify-center shadow-lg transition-transform duration-500">
            <span className="text-[10px] font-bold text-amber-200/75 tracking-wider font-mono uppercase animate-pulse">
              {currentStage === 'CHICK'
                ? "👑 STAND BY FOR THE QUEEN HEN EMERGENCE! 👑"
                : "🐣 STAND BY FOR THE CHICK EMERGENCE! 🐣"}
            </span>
          </div>
        </div>
      )}

      {/* Swipe Turn Overlay Alert */}
      {isNearCornerTurn && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center justify-center p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl backdrop-blur-md shadow-2xl animate-bounce">
          <span className="text-3xl animate-pulse">
            {cornerTurnDirection === 'LEFT' ? '⬅️' : cornerTurnDirection === 'RIGHT' ? '➡️' : '⚠️'}
          </span>
          <span className="text-xs font-black text-amber-400 tracking-wider font-mono uppercase mt-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {cornerTurnDirection === 'LEFT' ? 'SWIPE LEFT!' : cornerTurnDirection === 'RIGHT' ? 'SWIPE RIGHT!' : 'CHOOSE A TURN!'}
          </span>
          <span className="text-[8px] font-extrabold text-amber-200 mt-0.5 uppercase tracking-wider">
            ⚠️ 90° CORNER DETECTED! ⚠️
          </span>
        </div>
      )}

      {/* Top HUD: Stats Bar */}
      <div className="flex justify-between items-start w-full pointer-events-auto">
        {/* Left indicators: Combined Compact Stats Panel */}
        <div className="flex flex-col gap-1.5 responsive-hud-left w-[140px] min-w-[140px]">
          {/* Top Left Combined Compact Stats Panel */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl backdrop-blur shadow-2xl flex flex-col gap-1.5 w-full relative overflow-hidden" style={{ padding: '10px 12px', minHeight: 72, borderRadius: 16 }}>
            <div className="grid grid-cols-2 gap-2 text-left">
              <div>
                <span className="text-[11px] text-slate-400 font-mono tracking-wider leading-none block font-black uppercase">SCORE</span>
                <span className="font-black text-white font-mono leading-none block mt-1 truncate" style={{ fontSize: 20 }}>
                  {score.toLocaleString()}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 font-mono tracking-wider leading-none block font-black uppercase">DIST</span>
                <span className="font-black text-yellow-400 font-mono leading-none block mt-1 truncate" style={{ fontSize: 20 }}>
                  {Math.round(distance)}m
                </span>
              </div>
            </div>

            {/* Divider Line */}
            <div className="border-t border-slate-800/60 my-0.5" />

            {/* Feed and Eggs Row */}
            <div className="flex items-center justify-between text-[8px] font-mono text-white leading-none">
              <span className="flex items-center gap-0.5" title="Feeds Collected">
                🌾 <span className="font-extrabold text-amber-400">Feed:</span> <span className="font-black text-white">{feedsCollected}</span>
              </span>
              <span className="flex items-center gap-0.5" title="Crystal Eggs Collected">
                🥚 <span className="font-extrabold text-[#79ddff]">Eggs:</span> <span className="font-black text-white">{gemsCollected}</span>
              </span>
            </div>

            {isStage2 && (
              <div className="border-t border-slate-800/60 pt-1 mt-0.5 text-[7px] flex flex-col gap-0.5 font-mono text-left">
                <div className="flex items-center justify-between text-amber-500 font-bold">
                  <span>🥚 Laid:</span>
                  <span className="font-black text-white">{brownEggsCollected}/30</span>
                </div>
                <div className="flex items-center justify-between text-cyan-400 font-bold uppercase tracking-wider text-[6.5px]">
                  <span>Trays:</span>
                  <span className="font-black">{Math.floor(brownEggsCollected / 30)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Top-Left Corner Side Active Power-up Sliders */}
          <div className="flex flex-col gap-1 w-full pointer-events-auto">
            {activePowerUps.map((p) => {
              const pct = Math.round((p.timeLeft / p.duration) * 100);
              let powerColor = 'bg-yellow-400';
              let powerEmoji = '🎒';
              let label = 'POWER-UP';

              if (p.type === PowerUpType.MAGNET) {
                powerColor = 'bg-red-500';
                powerEmoji = '🧲';
                label = 'MAGNET';
              } else if (p.type === PowerUpType.SHIELD) {
                powerColor = 'bg-emerald-500';
                powerEmoji = '🛡️';
                label = 'SHIELD';
              } else if (p.type === PowerUpType.SPEED_BOOST) {
                powerColor = 'bg-amber-400';
                powerEmoji = '⚡';
                label = 'BOOST';
              } else if (p.type === PowerUpType.DOUBLE_SCORE) {
                powerColor = 'bg-purple-500';
                powerEmoji = '⭐';
                label = 'DOUBLE';
              } else if (p.type === PowerUpType.FLYING_MODE) {
                powerColor = 'bg-cyan-400 animate-pulse';
                powerEmoji = '🪶';
                label = 'FLIGHT';
              }

              return (
                <div
                  key={p.type}
                  className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-1.5 backdrop-blur-md shadow-lg flex flex-col gap-0.5 text-[9px] w-full"
                >
                  <div className="flex items-center justify-between text-white font-mono leading-none">
                    <span className="flex items-center gap-0.5 font-bold truncate">
                      <span>{powerEmoji}</span>
                      <span className="truncate max-w-[80px] text-[7px] uppercase tracking-wider font-extrabold">{label}</span>
                    </span>
                    <span className="font-bold text-amber-300 text-[7px] font-mono whitespace-nowrap">
                      {p.timeLeft.toFixed(1)}s
                    </span>
                  </div>

                  {/* Small progress bar */}
                  <div className="w-full bg-slate-800/40 rounded-full h-0.5 overflow-hidden border border-slate-900/20 mt-0.5">
                    <div
                      className={`h-full ${powerColor} transition-all duration-100 ease-linear`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right side trackers: Pause trigger button only */}
        <div className="flex items-center gap-2 responsive-hud-right pointer-events-auto">
          {/* PAUSE TRIGGER BUTTON */}
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
export default GameHUD;
