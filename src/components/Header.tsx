/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Activity,
  Box,
  Camera,
  Compass,
  Cpu,
  Eye,
  Hand,
  HelpCircle,
  Layers,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import { TrackingMetrics } from '../types';

interface HeaderProps {
  metrics: TrackingMetrics;
  mode: 'LIVE' | 'DEMO' | 'CALIBRATING';
  isCameraActive: boolean;
  hasPose: boolean;
  hasLeftHand: boolean;
  hasRightHand: boolean;
  enablePickPlace: boolean;
  enableDebug: boolean;
  soundEnabled: boolean;
  showGestureGuide: boolean;
  motionTrailsEnabled: boolean;
  onTogglePickPlace: () => void;
  onToggleDebug: () => void;
  onToggleSound: () => void;
  onToggleGestureGuide: () => void;
  onToggleMotionTrails: () => void;
  onOpenSettings: () => void;
  onStartCalibration: () => void;
  onToggleDemo: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  metrics,
  mode,
  isCameraActive,
  hasPose,
  hasLeftHand,
  hasRightHand,
  enablePickPlace,
  enableDebug,
  soundEnabled,
  showGestureGuide,
  motionTrailsEnabled,
  onTogglePickPlace,
  onToggleDebug,
  onToggleSound,
  onToggleGestureGuide,
  onToggleMotionTrails,
  onOpenSettings,
  onStartCalibration,
  onToggleDemo,
}) => {
  return (
    <header className="h-14 bg-white/95 border-b border-slate-200/90 px-4 flex items-center justify-between z-30 shrink-0 select-none shadow-xs">
      {/* Brand & Mode */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center text-white shadow-xs">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-slate-900 text-sm">
                MotionMirror <span className="text-cyan-600 font-semibold">AI</span>
              </span>
              <span
                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                  mode === 'LIVE'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : mode === 'DEMO'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                }`}
              >
                {mode}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 hidden sm:block">
              Half-Body Humanoid Robotics Lab
            </p>
          </div>
        </div>
      </div>

      {/* Hardware / Tracking Live Telemetry Pills */}
      <div className="hidden md:flex items-center gap-2 font-mono text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/70">
          <Camera
            className={`w-3.5 h-3.5 ${
              isCameraActive ? 'text-emerald-600' : 'text-slate-400'
            }`}
          />
          <span className="text-[10px] font-medium">CAM</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isCameraActive ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          />
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/70">
          <Activity
            className={`w-3.5 h-3.5 ${
              hasPose ? 'text-emerald-600' : 'text-slate-400'
            }`}
          />
          <span className="text-[10px] font-medium">POSE</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              hasPose ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          />
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/70">
          <Hand
            className={`w-3.5 h-3.5 ${
              hasLeftHand ? 'text-cyan-600' : 'text-slate-400'
            }`}
          />
          <span className="text-[10px] font-medium">L HAND</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              hasLeftHand ? 'bg-cyan-500' : 'bg-slate-300'
            }`}
          />
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/70">
          <Hand
            className={`w-3.5 h-3.5 ${
              hasRightHand ? 'text-cyan-600' : 'text-slate-400'
            }`}
          />
          <span className="text-[10px] font-medium">R HAND</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              hasRightHand ? 'bg-cyan-500' : 'bg-slate-300'
            }`}
          />
        </div>

        <div className="flex items-center gap-3 pl-2 border-l border-slate-200 text-slate-700">
          <div>
            <span className="text-[10px] text-slate-600 mr-1 font-semibold">RENDER</span>
            <span className="font-bold text-slate-900">{Math.round(metrics.renderFps)}</span>
            <span className="text-[9px] text-slate-600 ml-0.5">FPS</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-600 mr-1 font-semibold">VISION</span>
            <span className="font-bold text-cyan-700">{metrics.visionFps}</span>
            <span className="text-[9px] text-slate-600 ml-0.5">FPS</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-600 mr-1 font-semibold">LATENCY</span>
            <span className="font-bold text-slate-900">
              {metrics.latencyMs > 0 ? `${metrics.latencyMs.toFixed(0)}ms` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Actions & Controls */}
      <div className="flex items-center gap-2">
        <button
          id="btn-calibration"
          onClick={onStartCalibration}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
          title="Calibrate neutral body stance and arm reach"
        >
          <Compass className="w-3.5 h-3.5 text-cyan-600" />
          <span className="hidden sm:inline">Calibrate</span>
        </button>

        <button
          id="btn-toggle-demo"
          onClick={onToggleDemo}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs ${
            mode === 'DEMO'
              ? 'bg-amber-500 text-white border-amber-600'
              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
          }`}
          title="Run canned motion demo without webcam"
        >
          <Play className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Demo</span>
        </button>

        {/* Servo Audio Toggle Button */}
        <button
          id="btn-toggle-sound"
          onClick={onToggleSound}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs ${
            soundEnabled
              ? 'bg-cyan-50 border-cyan-300 text-cyan-800'
              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
          }`}
          title={soundEnabled ? 'Mute spatial servo audio' : 'Enable spatial servo audio'}
        >
          {soundEnabled ? (
            <Volume2 className="w-3.5 h-3.5 text-cyan-600" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span className="hidden md:inline">
            {soundEnabled ? 'Audio' : 'Muted'}
          </span>
        </button>

        {/* Motion Trails Toggle Button */}
        <button
          id="btn-toggle-trails"
          onClick={onToggleMotionTrails}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs ${
            motionTrailsEnabled
              ? 'bg-cyan-50 border-cyan-300 text-cyan-800'
              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
          }`}
          title="Toggle 3D hand motion trajectory trails"
        >
          <Wind className="w-3.5 h-3.5 text-cyan-600" />
          <span className="hidden md:inline">Trails</span>
        </button>

        {/* Gesture Guide Toggle Button */}
        <button
          id="btn-toggle-guide"
          onClick={onToggleGestureGuide}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs ${
            showGestureGuide
              ? 'bg-cyan-600 text-white border-cyan-700'
              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
          }`}
          title="Toggle gesture mappings helper overlay"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Guide</span>
        </button>

        <button
          id="btn-toggle-pickplace"
          onClick={onTogglePickPlace}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs ${
            enablePickPlace
              ? 'bg-cyan-600 text-white border-cyan-700'
              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
          }`}
          title="Toggle Pick & Place workbench station"
        >
          <Box className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Pick & Place</span>
        </button>

        <button
          id="btn-toggle-debug"
          onClick={onToggleDebug}
          className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs ${
            enableDebug
              ? 'bg-slate-800 text-white border-slate-900'
              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
          }`}
          title="Toggle telemetry debug drawer"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Debug</span>
        </button>

        <button
          id="btn-settings"
          onClick={onOpenSettings}
          className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
          title="Tracking and visual settings"
        >
          <Sliders className="w-3.5 h-3.5 text-slate-600" />
          <span className="hidden sm:inline">Settings</span>
        </button>
      </div>
    </header>
  );
};
