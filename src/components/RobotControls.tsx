/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  OctagonX,
  RotateCcw,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { RobotCommand, RobotConnectionStatus } from '../types/robot';

interface RobotControlsProps {
  activeCommand: RobotCommand;
  onSetCommand: (command: RobotCommand, source?: string) => void;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
  isEmergencyStopped: boolean;
  connectionStatus: RobotConnectionStatus;
  latencyMs?: number;
  className?: string;
}

export const RobotControls: React.FC<RobotControlsProps> = ({
  activeCommand,
  onSetCommand,
  onEmergencyStop,
  onResetEmergencyStop,
  isEmergencyStopped,
  connectionStatus,
  latencyMs = 0,
  className = '',
}) => {
  const isForward = activeCommand === 'FORWARD';
  const isBackward = activeCommand === 'BACKWARD';
  const isLeft = activeCommand === 'LEFT';
  const isRight = activeCommand === 'RIGHT';
  const isStopped = activeCommand === 'STOP';

  return (
    <div
      className={`bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-sm font-sans select-none ${className}`}
    >
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
        <div>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Robot Drive Controls
          </h3>
          <p className="text-[10px] text-slate-400">
            Hand gesture driven with keyboard fallback (W/A/S/D)
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-600 font-semibold uppercase">
            {connectionStatus}
          </span>
          {latencyMs > 0 && (
            <span className="text-slate-400 ml-1">({latencyMs}ms)</span>
          )}
        </div>
      </div>

      {/* Emergency Stop Banner if latched */}
      {isEmergencyStopped && (
        <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-700">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="text-xs font-semibold">
              Emergency Stop Latched
            </span>
          </div>
          <button
            onClick={onResetEmergencyStop}
            className="px-2.5 py-1 text-[11px] font-bold bg-white text-rose-700 border border-rose-300 rounded-lg hover:bg-rose-100 transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      )}

      {/* D-Pad & Controls Grid */}
      <div className="flex flex-col items-center justify-center gap-1.5 my-2">
        {/* Forward button */}
        <button
          onClick={() => onSetCommand('FORWARD', 'manual_touch')}
          className={`w-14 h-12 rounded-xl flex flex-col items-center justify-center font-bold text-xs transition-all duration-100 shadow-2xs border cursor-pointer ${
            isForward
              ? 'bg-emerald-500 text-white border-emerald-600 shadow-md scale-105'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
          }`}
          title="Move Forward [W or Up Arrow]"
        >
          <ArrowUp className="w-4 h-4" />
          <span className="text-[9px] font-mono">W</span>
        </button>

        <div className="flex items-center gap-1.5">
          {/* Left button */}
          <button
            onClick={() => onSetCommand('LEFT', 'manual_touch')}
            className={`w-14 h-12 rounded-xl flex flex-col items-center justify-center font-bold text-xs transition-all duration-100 shadow-2xs border cursor-pointer ${
              isLeft
                ? 'bg-sky-500 text-white border-sky-600 shadow-md scale-105'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title="Turn Left [A or Left Arrow]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-[9px] font-mono">A</span>
          </button>

          {/* Center Stop Button */}
          <button
            onClick={() => onSetCommand('STOP', 'manual_touch')}
            className={`w-14 h-12 rounded-xl flex flex-col items-center justify-center font-bold text-xs transition-all duration-100 shadow-2xs border cursor-pointer ${
              isStopped && !isEmergencyStopped
                ? 'bg-slate-800 text-white border-slate-900 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
            }`}
            title="Stop [Space]"
          >
            <OctagonX className="w-4 h-4 text-rose-400" />
            <span className="text-[9px] font-mono">STOP</span>
          </button>

          {/* Right button */}
          <button
            onClick={() => onSetCommand('RIGHT', 'manual_touch')}
            className={`w-14 h-12 rounded-xl flex flex-col items-center justify-center font-bold text-xs transition-all duration-100 shadow-2xs border cursor-pointer ${
              isRight
                ? 'bg-sky-500 text-white border-sky-600 shadow-md scale-105'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title="Turn Right [D or Right Arrow]"
          >
            <ArrowRight className="w-4 h-4" />
            <span className="text-[9px] font-mono">D</span>
          </button>
        </div>

        {/* Backward button */}
        <button
          onClick={() => onSetCommand('BACKWARD', 'manual_touch')}
          className={`w-14 h-12 rounded-xl flex flex-col items-center justify-center font-bold text-xs transition-all duration-100 shadow-2xs border cursor-pointer ${
            isBackward
              ? 'bg-amber-500 text-white border-amber-600 shadow-md scale-105'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
          }`}
          title="Move Backward [S or Down Arrow]"
        >
          <ArrowDown className="w-4 h-4" />
          <span className="text-[9px] font-mono">S</span>
        </button>
      </div>

      {/* Big Emergency Stop Button */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <button
          onClick={onEmergencyStop}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm shadow-rose-200 cursor-pointer active:scale-98 transition-all"
        >
          <OctagonX className="w-4 h-4 animate-pulse" />
          <span>EMERGENCY STOP (ESC)</span>
        </button>
      </div>
    </div>
  );
};
