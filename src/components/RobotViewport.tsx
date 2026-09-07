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
  Package,
  Rotate3d,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Wind,
  Zap,
} from 'lucide-react';
import { GestureType, PickableObject } from '../types';
import { GestureGuide } from './GestureGuide';

interface RobotViewportProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  robotResponseState: string;
  gesture: GestureType;
  cameraPreset: 'front' | '3q' | 'side' | 'top' | 'close';
  enablePickPlace: boolean;
  pickPlaceStatus: string;
  heldObject: PickableObject | null;
  placedCount: number;
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
  onResetPickPlace: () => void;
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
  enablePickPlace,
  pickPlaceStatus,
  heldObject,
  placedCount,
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
  onResetPickPlace,
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
      <div className="h-9 px-4 bg-white/80 border-b border-slate-200/80 flex items-center justify-between text-xs text-slate-600 shrink-0 z-10 backdrop-blur-xs">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
            <Rotate3d className="w-3.5 h-3.5 text-cyan-600" />
            ROBOT MIRROR (HALF-BODY)
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600 font-medium hidden sm:inline">
            CLEAN LAB ENVIRONMENT
          </span>
        </div>

        {/* Viewport Sub-Controls: Quick toggles + Camera View Angle Presets */}
        <div className="flex items-center gap-2">
          {/* Quick Trail, Lighting, Boundary Toggles */}
          <div className="flex items-center gap-1 pr-2 border-r border-slate-200">
            <button
              onClick={onToggleMotionTrails}
              className={`p-1 rounded text-[10px] font-mono transition-colors flex items-center gap-1 ${
                motionTrailsEnabled
                  ? 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100/70 border border-cyan-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200/80'
              }`}
              title={motionTrailsEnabled ? 'Disable motion trails' : 'Enable motion trails'}
            >
              <Wind className="w-3 h-3 text-cyan-600" />
            </button>

            <button
              onClick={onToggleStudioLighting}
              className={`p-1 rounded text-[10px] font-mono transition-colors flex items-center gap-1 ${
                studioLightingEnabled
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100/70 border border-amber-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200/80'
              }`}
              title={
                studioLightingEnabled
                  ? 'Disable dynamic studio lighting'
                  : 'Enable dynamic studio lighting (twin hand-tracking spotlights)'
              }
            >
              <SunMedium
                className={`w-3 h-3 ${studioLightingEnabled ? 'text-amber-500' : 'text-slate-400'}`}
              />
            </button>

            {onToggleBodyBoundary && (
              <button
                onClick={onToggleBodyBoundary}
                className={`p-1 rounded text-[10px] font-mono transition-colors flex items-center gap-1 ${
                  bodyBoundaryEnabled
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70 border border-emerald-200'
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200/80'
                }`}
                title={
                  bodyBoundaryEnabled
                    ? 'Body collision boundary ACTIVE (prevents hands penetrating torso/head)'
                    : 'Enable body collision boundary'
                }
              >
                {bodyBoundaryEnabled ? (
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Shield className="w-3 h-3 text-slate-400" />
                )}
              </button>
            )}

            <button
              onClick={onToggleGestureGuide}
              className={`p-1 rounded text-[10px] font-mono transition-colors flex items-center gap-1 ${
                showGestureGuide
                  ? 'bg-cyan-600 text-white font-semibold shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
              title="Toggle gesture guide overlay"
            >
              <HelpCircle className="w-3 h-3" />
            </button>
          </div>

          {/* Camera View Angle Presets */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-slate-500 mr-1 hidden lg:inline font-medium">
              CAM:
            </span>
            {(['front', '3q', 'side', 'top', 'close'] as const).map(preset => (
              <button
                key={preset}
                onClick={() => onSetCameraPreset(preset)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors ${
                  cameraPreset === preset
                    ? 'bg-cyan-600 text-white font-semibold shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                {preset === '3q' ? '3/4' : preset}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3D Canvas Container */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <canvas
          id="robot-canvas"
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block cursor-grab active:cursor-grabbing outline-none"
        />

        {/* Top-Right Robot Status Pill & Futuristic Badges */}
        <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5 pointer-events-none">
          <div className="px-3 py-1 rounded-lg bg-white/90 border border-slate-200/90 shadow-xs backdrop-blur-xs flex items-center gap-2 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500 font-medium">STATUS:</span>
            <span className="font-bold text-slate-800">{robotResponseState}</span>
          </div>

          {/* Body Boundary Deflection Pill (When hand tries to penetrate body) */}
          {isAnyDeflected && (
            <div className="px-2.5 py-0.5 rounded-md bg-cyan-600/90 text-white border border-cyan-400 shadow-md backdrop-blur-xs font-mono text-[10px] font-bold flex items-center gap-1.5 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
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
            <div className="px-2.5 py-0.5 rounded-md bg-cyan-50/90 border border-cyan-200 shadow-2xs backdrop-blur-xs font-mono text-[10px] text-cyan-800 font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-cyan-600" />
              <span>DETECTED: {gesture}</span>
            </div>
          )}

          {/* Autonomous Saccade Indicator */}
          {isSaccading && (
            <div className="px-2.5 py-0.5 rounded-md bg-emerald-50/90 border border-emerald-200/90 shadow-2xs backdrop-blur-xs font-mono text-[10px] text-emerald-800 font-medium flex items-center gap-1.5">
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

        {/* Pick & Place Overlay Banner (when enabled) */}
        {enablePickPlace && (
          <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between p-3 rounded-xl bg-white/90 border border-slate-200/90 shadow-md backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Industrial Pick & Place Station
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono font-semibold">
                    PLACED: {placedCount}
                  </span>
                </div>
                <p className="text-[11px] text-cyan-700 font-mono font-medium">
                  {pickPlaceStatus}
                </p>
              </div>
            </div>

            <button
              onClick={onResetPickPlace}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium font-mono transition-colors"
            >
              Reset Station
            </button>
          </div>
        )}
      </div>

      {/* Footer Details Bar */}
      <div className="h-8 px-4 bg-white/90 border-t border-slate-200/80 flex items-center justify-between font-mono text-[10px] text-slate-600 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <span>
            RIG: <b className="text-slate-800">HUMANOID COBOT V2</b>
          </span>
          <span>
            BOUNDARY: <b className={bodyBoundaryEnabled ? 'text-emerald-700' : 'text-slate-500'}>{bodyBoundaryEnabled ? 'ENFORCED (ANTI-PENETRATION)' : 'DISABLED'}</b>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {motionTrailsEnabled && (
            <span className="text-cyan-700 flex items-center gap-1">
              <Wind className="w-3 h-3" /> MOTION TRAILS ACTIVE
            </span>
          )}
          {studioLightingEnabled && (
            <span className="text-amber-600 flex items-center gap-1">
              <SunMedium className="w-3 h-3" /> STUDIO LIGHTING ACTIVE
            </span>
          )}
          <span>MOUNT: <b className="text-slate-800">RESEARCH PEDESTAL</b></span>
        </div>
      </div>
    </div>
  );
};

