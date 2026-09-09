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
  Hand,
  OctagonX,
  ShieldCheck,
  Zap,
  HelpCircle,
} from 'lucide-react';
import { GestureName, GestureResult, RobotCommand } from '../types/robot';

interface GestureStatusProps {
  gestureResult: GestureResult;
  isHandDetected: boolean;
  minConfidence: number;
  candidateCount?: number;
  requiredFrames?: number;
  className?: string;
}

export const GestureStatus: React.FC<GestureStatusProps> = ({
  gestureResult,
  isHandDetected,
  minConfidence,
  candidateCount = 3,
  requiredFrames = 3,
  className = '',
}) => {
  const { gesture, command, confidence } = gestureResult;
  const confidencePct = Math.round(confidence * 100);
  const isConfident = confidence >= minConfidence;

  // Icon corresponding to the gesture command
  const getCommandIcon = () => {
    switch (command) {
      case 'FORWARD':
        return <ArrowUp className="w-5 h-5 text-emerald-500 animate-bounce" />;
      case 'BACKWARD':
        return <ArrowDown className="w-5 h-5 text-amber-500 animate-bounce" />;
      case 'LEFT':
        return <ArrowLeft className="w-5 h-5 text-sky-500 animate-pulse" />;
      case 'RIGHT':
        return <ArrowRight className="w-5 h-5 text-sky-500 animate-pulse" />;
      case 'STOP':
      default:
        return <OctagonX className="w-5 h-5 text-rose-500" />;
    }
  };

  const getGestureLabel = (name: GestureName): string => {
    switch (name) {
      case 'THUMB_UP':
        return 'Thumb Up';
      case 'THUMB_DOWN':
        return 'Thumb Down';
      case 'POINT_LEFT':
        return 'Point / Tilt Left';
      case 'POINT_RIGHT':
        return 'Point / Tilt Right';
      case 'OPEN_PALM':
        return 'Open Palm (Stop)';
      case 'CLOSED_FIST':
        return 'Closed Fist (Stop)';
      case 'NO_HAND':
        return 'No Hand in View';
      case 'UNKNOWN':
      default:
        return 'Uncertain Gesture';
    }
  };

  const getCommandBadgeClasses = (cmd: RobotCommand): string => {
    switch (cmd) {
      case 'FORWARD':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'BACKWARD':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'LEFT':
      case 'RIGHT':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'STOP':
      default:
        return 'bg-rose-50 text-rose-700 border-rose-200';
    }
  };

  return (
    <div
      className={`bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-3 shadow-xs font-sans ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
            {getCommandIcon()}
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Recognized Gesture
            </div>
            <div className="text-xs font-bold text-slate-800">
              {getGestureLabel(gesture)}
            </div>
          </div>
        </div>

        <div
          className={`px-2.5 py-1 rounded-md border text-xs font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 ${getCommandBadgeClasses(
            command
          )}`}
        >
          <span>{command}</span>
        </div>
      </div>

      {/* Telemetry row: Confidence Bar and Stability Frames */}
      <div className="space-y-1.5 pt-1 border-t border-slate-100">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500 font-medium flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            Confidence:
          </span>
          <span
            className={`font-mono font-semibold ${
              isConfident ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            {confidencePct}%
          </span>
        </div>

        {/* Progress meter */}
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-150 rounded-full ${
              isConfident ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
            style={{ width: `${confidencePct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>Min Threshold: {Math.round(minConfidence * 100)}%</span>
          <span>
            Stability: {Math.min(requiredFrames, candidateCount)}/{requiredFrames} f
          </span>
        </div>
      </div>
    </div>
  );
};
