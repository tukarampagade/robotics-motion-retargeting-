/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Camera,
  CheckCircle2,
  Compass,
  Cpu,
  Eye,
  HelpCircle,
  Maximize,
  OctagonX,
  Rotate3d,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Wind,
  Zap,
} from 'lucide-react';
import { GestureType, RobotCommand } from '../types';
import { GestureGuide } from './GestureGuide';

interface RobotViewportProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  robotResponseState: string;
  gesture: GestureType;
  cameraPreset: 'front' | '3q' | 'side' | 'top' | 'close';
  activeRobotCommand?: RobotCommand;
  isEmergencyStopped?: boolean;
  driveSpeed?: number;
  showGestureGuide: boolean;
  motionTrailsEnabled: boolean;
  studioLightingEnabled: boolean;
  bodyBoundaryEnabled?: boolean;
  showBodyBoundaryShield?: boolean;
  futuristicMode?: boolean;
  isDeflectedLeft?: boolean;
  isDeflectedRight?: boolean;
  isSaccading?: boolean;
  onSetCameraPreset: (preset: 'front' | '3q' | 'side' | 'top' | 'close') => void;
  onToggleGestureGuide: () => void;
  onToggleMotionTrails: () => void;
  onToggleStudioLighting: () => void;
  onToggleBodyBoundary?: () => void;
  onToggleShield?: () => void;
  onToggleFuturistic?: () => void;
}

export const RobotViewport: React.FC<RobotViewportProps> = ({
  canvasRef,
  robotResponseState,
  gesture,
  cameraPreset,
  activeRobotCommand = 'STOP',
  isEmergencyStopped = false,
  driveSpeed = 0,
  showGestureGuide,
  motionTrailsEnabled,
  studioLightingEnabled,
  bodyBoundaryEnabled = true,
  showBodyBoundaryShield = false,
  futuristicMode = false,
  isDeflectedLeft = false,
  isDeflectedRight = false,
  isSaccading = false,
  onSetCameraPreset,
  onToggleGestureGuide,
  onToggleMotionTrails,
  onToggleStudioLighting,
  onToggleBodyBoundary,
  onToggleShield,
  onToggleFuturistic,
}) => {
  const isAnyDeflected = isDeflectedLeft || isDeflectedRight;

  return (
    <div className="relative flex flex-col h-full bg-[#f4f7fa] overflow-hidden select-none">
      {/* View Header */}
      <div className="h-9 px-4 bg-white/95 border-b border-slate-200 flex items-center justify-between text-xs text-slate-700 shrink-0 z-10 backdrop-blur-xs">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="font-semibold text-slate-900 flex items-center gap-1.5">
            <Rotate3d className="w-3.5 h-3.5 text-sky-600" />
            3D ROBOT VIEWPORT
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 hidden sm:inline">
            Humanoid Articulated Rig
          </span>
        </div>

        {/* Viewport Camera Angle Presets & Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-mono text-slate-400 mr-1 hidden sm:inline">
            CAMERA:
          </span>
          {(['front', '3q', 'side', 'top', 'close'] as const).map(preset => (
            <button
              key={preset}
              onClick={() => onSetCameraPreset(preset)}
              className={`px-2 py-0.5 rounded-lg text-[10.5px] font-mono uppercase transition-all cursor-pointer ${
                cameraPreset === preset
                  ? 'bg-sky-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/60'
              }`}
            >
              {preset === '3q' ? '3/4 ISO' : preset}
            </button>
          ))}
        </div>
      </div>

      {/* 3D Canvas Container */}
      <div className="relative flex-1 min-h-0 overflow-hidden bg-[#f4f7fa]">
        <canvas
          id="robot-canvas"
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block cursor-grab active:cursor-grabbing outline-none"
        />

        {/* Top-Right Robot Status Pill & Futuristic Badges */}
        <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5 pointer-events-none">
          <div className="px-3 py-1 rounded-lg bg-white/95 border border-slate-200 shadow-sm backdrop-blur-xs flex items-center gap-2 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500 font-medium">ROBOT:</span>
            <span className="font-bold text-slate-800">{robotResponseState}</span>
          </div>

          {/* Body Boundary Deflection Pill (When hand tries to penetrate body) */}
          {isAnyDeflected && (
            <div className="px-2.5 py-0.5 rounded-md bg-amber-500 text-white border border-amber-600 shadow-md backdrop-blur-xs font-mono text-[10px] font-bold flex items-center gap-1.5 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-white" />
              <span>
                BOUNDARY SHIELD:{' '}
                {isDeflectedLeft && isDeflectedRight
                  ? 'DUAL ARM DEFLECTION'
                  : isDeflectedLeft
                  ? 'LEFT ARM DEFLECTED'
                  : 'RIGHT ARM DEFLECTED'}
              </span>
            </div>
          )}

          {/* Active Gesture badge */}
          {gesture !== '—' && gesture !== 'MIRRORING' && (
            <div className="px-2.5 py-0.5 rounded-md bg-white/95 border border-sky-300 shadow-xs backdrop-blur-xs font-mono text-[10px] text-sky-800 font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-sky-600" />
              <span>GESTURE: {gesture}</span>
            </div>
          )}

          {/* Autonomous Saccade Indicator */}
          {isSaccading && (
            <div className="px-2.5 py-0.5 rounded-md bg-white/95 border border-emerald-300 shadow-xs backdrop-blur-xs font-mono text-[10px] text-emerald-800 font-medium flex items-center gap-1.5">
              <Eye className="w-3 h-3 text-emerald-600 animate-pulse" />
              <span>SACCADE: SCANNING LAB</span>
            </div>
          )}
        </div>

        {/* Unobtrusive Toggleable Gesture Guide Overlay */}
        <GestureGuide
          isOpen={showGestureGuide}
          currentGesture={gesture}
          onToggleOpen={onToggleGestureGuide}
        />

        {/* Robot Locomotion Status Overlay Banner (when driving) */}
        {activeRobotCommand !== 'STOP' && (
          <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between p-3 rounded-xl bg-white/95 border border-slate-200 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <Compass className="w-5 h-5 animate-spin" style={{ animationDuration: '4s' }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    Active Robot Locomotion
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold uppercase">
                    {activeRobotCommand}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  Speed: {driveSpeed.toFixed(2)} m/s &bull; Hand sign guided &bull; Watchdog armed
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Details Bar */}
      <div className="h-8 px-4 bg-white/95 border-t border-slate-200 flex items-center justify-between font-mono text-[10px] text-slate-500 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <span>
            RIG: <b className="text-slate-800">HUMANOID COBOT V2</b>
          </span>
          <span>
            BOUNDARY: <b className={bodyBoundaryEnabled ? 'text-emerald-600' : 'text-slate-400'}>{bodyBoundaryEnabled ? 'ENFORCED (ANTI-PENETRATION)' : 'DISABLED'}</b>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {motionTrailsEnabled && (
            <span className="text-sky-600 flex items-center gap-1 font-semibold">
              <Wind className="w-3 h-3" /> TRAILS ACTIVE
            </span>
          )}
          {studioLightingEnabled && (
            <span className="text-amber-600 flex items-center gap-1 font-semibold">
              <SunMedium className="w-3 h-3" /> STUDIO LIGHTS
            </span>
          )}
          <span>MOUNT: <b className="text-slate-800">RESEARCH PEDESTAL</b></span>
        </div>
      </div>
    </div>
  );
};

