/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Activity, Clock, Cpu, Eye, Gauge, Keyboard, ShieldCheck } from 'lucide-react';
import { GestureType, TrackingMetrics } from '../types';

interface FooterProps {
  metrics: TrackingMetrics;
  mode: 'LIVE' | 'DEMO' | 'CALIBRATING';
  isCameraActive: boolean;
  currentGesture: GestureType;
  robotResponseState: string;
}

export const Footer: React.FC<FooterProps> = ({
  metrics,
  mode,
  isCameraActive,
  currentGesture,
  robotResponseState,
}) => {
  const isHealthy = metrics.renderFps >= 30;

  return (
    <footer className="h-9 px-4 bg-white border-t border-slate-200 flex items-center justify-between font-mono text-[11px] text-slate-500 shrink-0 z-20 select-none shadow-2xs">
      {/* Left: Engine Operational Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-sans font-semibold">
          <span
            className={`w-2 h-2 rounded-full ${
              isCameraActive
                ? 'bg-emerald-500 animate-pulse'
                : mode === 'DEMO'
                ? 'bg-amber-500'
                : 'bg-slate-400'
            }`}
          />
          <span className="text-slate-800 text-xs">
            {mode === 'DEMO'
              ? 'Simulation Active'
              : isCameraActive
              ? 'Humanoid Online'
              : 'Standby'}
          </span>
        </div>

        <span className="text-slate-200 hidden md:inline">|</span>

        <div className="hidden md:flex items-center gap-1 text-slate-500 font-sans">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[11px]">Kinematics Collision Bounds Enforced</span>
        </div>
      </div>

      {/* Center: Productivity Keyboard Shortcut Hints */}
      <div className="hidden lg:flex items-center gap-2 text-slate-400 text-[10.5px]">
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
            [
          </kbd>
          <span>Sidebar</span>
        </span>
        <span className="text-slate-300">•</span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
            Space
          </kbd>
          <span>Webcam</span>
        </span>
        <span className="text-slate-300">•</span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
            D
          </kbd>
          <span>Demo</span>
        </span>
        <span className="text-slate-300">•</span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
            C
          </kbd>
          <span>Calibrate</span>
        </span>
      </div>

      {/* Right: Critical Performance Telemetry (Render, Vision, Latency, Gesture) */}
      <div className="flex items-center gap-3">
        {/* Active Gesture Pill */}
        {currentGesture && currentGesture !== '—' && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 border border-sky-300 text-sky-800 text-[10px] font-semibold">
            <span>GESTURE:</span>
            <span className="font-bold">{currentGesture}</span>
          </div>
        )}

        {/* Latency */}
        <div className="flex items-center gap-1" title="End-to-end vision-to-actuation pipeline latency">
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="text-slate-400">LAT:</span>
          <span className="font-bold text-slate-800">
            {metrics.latencyMs > 0 ? `${Math.round(metrics.latencyMs)}ms` : '—'}
          </span>
        </div>

        {/* Vision FPS */}
        <div className="hidden sm:flex items-center gap-1" title="MediaPipe inference rate">
          <Eye className="w-3 h-3 text-sky-600" />
          <span className="text-slate-400">VIS:</span>
          <span className="font-bold text-sky-700">{metrics.visionFps}</span>
        </div>

        {/* Render FPS */}
        <div className="flex items-center gap-1" title="WebGL Three.js rendering frame rate">
          <Gauge className={`w-3 h-3 ${isHealthy ? 'text-emerald-600' : 'text-amber-600'}`} />
          <span className="text-slate-400">FPS:</span>
          <span className={`font-bold ${isHealthy ? 'text-slate-800' : 'text-amber-700'}`}>
            {Math.round(metrics.renderFps)}
          </span>
        </div>
      </div>
    </footer>
  );
};
