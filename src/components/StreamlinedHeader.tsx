/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Activity,
  Camera,
  Columns,
  Cpu,
  Eye,
  Maximize2,
  Minimize2,
  OctagonX,
  Play,
  RotateCcw,
  Sliders,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { TrackingMetrics, RobotCommand } from '../types';

export type WorkspaceLayout = 'split' | '3d-solo' | 'cam-solo';

interface StreamlinedHeaderProps {
  mode: 'LIVE' | 'DEMO' | 'CALIBRATING';
  isCameraActive: boolean;
  metrics: TrackingMetrics;
  workspaceLayout: WorkspaceLayout;
  onSetWorkspaceLayout: (layout: WorkspaceLayout) => void;
  onToggleCamera: () => void;
  onToggleDemo: () => void;
  onResetPose: () => void;
  onOpenSettings: () => void;
  isDebugOpen?: boolean;
  onToggleDebug?: () => void;
  activeRobotCommand?: RobotCommand;
  onEmergencyStop?: () => void;
  isEmergencyStopped?: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  accentColor?: 'cyan' | 'indigo' | 'emerald' | 'amber';
}

export const StreamlinedHeader: React.FC<StreamlinedHeaderProps> = ({
  mode,
  isCameraActive,
  metrics,
  workspaceLayout,
  onSetWorkspaceLayout,
  onToggleCamera,
  onToggleDemo,
  onResetPose,
  onOpenSettings,
  isDebugOpen,
  onToggleDebug,
  activeRobotCommand = 'STOP',
  onEmergencyStop,
  isEmergencyStopped = false,
  soundEnabled,
  onToggleSound,
}) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const isTracking = isCameraActive && (metrics.leftHandConfidence > 0.2 || metrics.rightHandConfidence > 0.2 || metrics.poseConfidence > 0.2);

  return (
    <header className="h-14 bg-white/95 border-b border-slate-200 px-4 flex items-center justify-between z-30 shrink-0 select-none shadow-xs backdrop-blur-md text-slate-800">
      {/* Left: Brand / Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 border border-sky-400/30 flex items-center justify-center text-white shadow-xs">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold tracking-tight text-slate-900 text-sm">
                Robotics Motion Retargeting
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200 font-semibold">
                AI LAB
              </span>
            </div>
            <p className="text-[10px] text-slate-500 hidden sm:block">
              Real-time Human Hand Gesture → Robot Hand Movement
            </p>
          </div>
        </div>
      </div>

      {/* Center: Live Tracking Status & FPS telemetry */}
      <div className="flex items-center gap-2.5 font-mono text-xs">
        {/* Tracking Status Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100/90 border border-slate-200 text-slate-700">
          <span
            className={`w-2 h-2 rounded-full ${
              isTracking
                ? 'bg-emerald-500 animate-pulse'
                : mode === 'DEMO'
                ? 'bg-amber-500 animate-pulse'
                : isCameraActive
                ? 'bg-sky-500'
                : 'bg-slate-400'
            }`}
          />
          <span className="text-[11px] font-semibold text-slate-800 uppercase tracking-wider">
            {isTracking
              ? 'TRACKING ACTIVE'
              : mode === 'DEMO'
              ? 'SIMULATION DEMO'
              : isCameraActive
              ? 'CAMERA STANDBY'
              : 'OFFLINE'}
          </span>
          {isTracking && (
            <span className="text-[10px] text-slate-500 hidden md:inline">
              ({metrics.latencyMs}ms)
            </span>
          )}
        </div>

        {/* Live FPS Display */}
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100/90 border border-slate-200 text-[11px] text-slate-700">
          <div className="flex items-center gap-1 text-sky-700">
            <span className="text-slate-500 text-[10px]">VISION:</span>
            <span className="font-bold">{metrics.visionFps}</span>
            <span className="text-[9px] text-slate-500">FPS</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1 text-emerald-700">
            <span className="text-slate-500 text-[10px]">RENDER:</span>
            <span className="font-bold">{metrics.renderFps}</span>
            <span className="text-[9px] text-slate-500">FPS</span>
          </div>
        </div>

        {/* Viewport Layout Mode Switcher (Split / 3D Solo / Cam Solo) */}
        <div className="hidden lg:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
          <button
            id="btn-layout-split"
            onClick={() => onSetWorkspaceLayout('split')}
            title="Split View (Webcam + 3D Viewport)"
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all text-[11px] cursor-pointer ${
              workspaceLayout === 'split'
                ? 'bg-white text-sky-700 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Columns className="w-3 h-3" />
            <span>Split</span>
          </button>

          <button
            id="btn-layout-3d"
            onClick={() => onSetWorkspaceLayout('3d-solo')}
            title="Focus on 3D Robot Viewport"
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all text-[11px] cursor-pointer ${
              workspaceLayout === '3d-solo'
                ? 'bg-white text-sky-700 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Square className="w-3 h-3" />
            <span>3D Solo</span>
          </button>

          <button
            id="btn-layout-cam"
            onClick={() => onSetWorkspaceLayout('cam-solo')}
            title="Focus on Human Vision Camera"
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all text-[11px] cursor-pointer ${
              workspaceLayout === 'cam-solo'
                ? 'bg-white text-sky-700 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>Cam Solo</span>
          </button>
        </div>
      </div>

      {/* Right: Essential Action Controls */}
      <div className="flex items-center gap-2">
        {/* Primary Webcam Button */}
        <button
          id="btn-primary-camera"
          onClick={onToggleCamera}
          title={isCameraActive ? 'Stop webcam stream' : 'Start webcam motion mirroring'}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
            isCameraActive
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/40'
              : 'bg-sky-600 hover:bg-sky-500 text-white border border-sky-500/30'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>{isCameraActive ? 'Camera Live' : 'Start Camera'}</span>
          {isCameraActive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
        </button>

        {/* Demo Simulation Mode Toggle */}
        <button
          id="btn-toggle-demo"
          onClick={onToggleDemo}
          title="Run automated humanoid motion sequences"
          className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
            mode === 'DEMO'
              ? 'bg-amber-600 text-white border-amber-500 shadow-xs'
              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{mode === 'DEMO' ? 'Stop' : 'Demo'}</span>
        </button>

        {/* Quick Reset Pose */}
        <button
          id="btn-reset-pose"
          onClick={onResetPose}
          title="Reset humanoid joints to zero neutral stance"
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer shadow-2xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Audio Feedback Toggle */}
        <button
          id="btn-toggle-sound"
          onClick={onToggleSound}
          title={soundEnabled ? 'Mute audio feedback' : 'Enable kinematic sound synthesizers'}
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer shadow-2xs"
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-sky-600" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
        </button>

        {/* Fullscreen Toggle */}
        <button
          id="btn-fullscreen"
          onClick={handleToggleFullscreen}
          title="Toggle Fullscreen"
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer hidden sm:flex shadow-2xs"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>

        {/* Robot Command & Safety Emergency Stop Button */}
        {onEmergencyStop && (
          <button
            id="btn-header-estop"
            onClick={onEmergencyStop}
            title="Immediate Emergency Stop [Esc or Space]"
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
              isEmergencyStopped
                ? 'border-rose-300 bg-rose-50 text-rose-700 animate-pulse'
                : activeRobotCommand !== 'STOP'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-600'
            }`}
          >
            <OctagonX className={`w-3.5 h-3.5 ${isEmergencyStopped ? 'text-rose-600' : 'text-rose-500'}`} />
            <span className="font-mono text-[11px] uppercase">
              {isEmergencyStopped ? 'E-STOPPED' : activeRobotCommand}
            </span>
          </button>
        )}

        {/* Debug Inspector Toggle */}
        {onToggleDebug && (
          <button
            id="btn-toggle-debug"
            onClick={onToggleDebug}
            title="Toggle Hand Kinematics 21-Landmark Debug Panel"
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
              isDebugOpen
                ? 'bg-sky-50 text-sky-700 border-sky-300'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-sky-600" />
            <span className="hidden md:inline font-sans">Debug</span>
          </button>
        )}

        {/* Settings Modal Toggle */}
        <button
          id="btn-open-settings"
          onClick={onOpenSettings}
          title="Open advanced kinematics and vision settings"
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer shadow-2xs"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
