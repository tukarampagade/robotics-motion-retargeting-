/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crosshair,
  FlipHorizontal,
  Hand,
  Info,
  Loader2,
  Pause,
  Play,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
  Video,
  X,
} from 'lucide-react';
import { GestureType, HandTrackingState, TrackingMetrics } from '../types';

interface CameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  isCameraActive: boolean;
  isCameraLoading?: boolean;
  isMirrorMode: boolean;
  gesture: GestureType;
  leftHand: HandTrackingState;
  rightHand: HandTrackingState;
  metrics: TrackingMetrics;
  poseConfidenceThreshold?: number;
  onToggleMirror: () => void;
  onStartCamera: () => void;
  onStartDemoMode?: () => void;
  isVideoSource?: boolean;
  isVideoPlaying?: boolean;
  onToggleVideoPlay?: () => void;
  onRestartVideo?: () => void;
  isCalibrating?: boolean;
  calibrationProgress?: number;
  onStartCalibration?: () => void;
  onCancelCalibration?: () => void;
  cameraError?: string | null;
  onDismissCameraError?: () => void;
  visionModelStatus?: 'unloaded' | 'loading' | 'ready' | 'error';
  visionModelMessage?: string;
}

export const CameraView: React.FC<CameraViewProps> = ({
  videoRef,
  overlayCanvasRef,
  isCameraActive,
  isCameraLoading = false,
  isMirrorMode,
  gesture,
  leftHand,
  rightHand,
  metrics,
  poseConfidenceThreshold = 0.25,
  onToggleMirror,
  onStartCamera,
  onStartDemoMode,
  isVideoSource = false,
  isVideoPlaying = true,
  onToggleVideoPlay,
  onRestartVideo,
  isCalibrating = false,
  calibrationProgress = 0,
  onStartCalibration,
  onCancelCalibration,
  cameraError,
  onDismissCameraError,
  visionModelStatus = 'ready',
  visionModelMessage,
}) => {
  const isHandDetected = leftHand.detected || rightHand.detected;
  const isNeutralAligned = isHandDetected && (gesture === 'OPEN_PALM' || gesture === 'MIRRORING');

  return (
    <div className="relative flex flex-col h-full bg-slate-100 border-r border-slate-200 overflow-hidden select-none">
      {/* View Header */}
      <div className="h-9 px-3 bg-white/95 border-b border-slate-200 flex items-center justify-between text-xs text-slate-700 shrink-0 z-10 backdrop-blur-xs">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="font-semibold text-slate-900 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-sky-600" />
            HUMAN VISION
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-sky-700 font-semibold">{metrics.visionFps} FPS</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Neutral Pose Calibration Trigger */}
          {onStartCalibration && isCameraActive && (
            <button
              id="btn-camera-calibrate"
              onClick={isCalibrating ? onCancelCalibration : onStartCalibration}
              className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border transition-colors cursor-pointer shadow-2xs ${
                isCalibrating
                  ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                  : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
              }`}
              title="Calibrate hand neutral pose (0° zero reference)"
            >
              <Crosshair className="w-3 h-3 text-sky-600" />
              <span>{isCalibrating ? 'CALIBRATING...' : 'ZERO POSE'}</span>
            </button>
          )}

          <button
            onClick={onToggleMirror}
            className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border transition-colors cursor-pointer shadow-2xs ${
              isMirrorMode
                ? 'bg-sky-50 text-sky-800 border-sky-300 font-semibold'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
            }`}
            title="Mirror webcam preview (matches physical mirror)"
          >
            <FlipHorizontal className="w-3 h-3" />
            <span>MIRROR</span>
          </button>
        </div>
      </div>

      {/* Video & Canvas Container */}
      <div className="relative flex-1 bg-slate-950 flex items-center justify-center min-h-0 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onLoadedMetadata={e => {
            const v = e.currentTarget;
            if (overlayCanvasRef.current && v.videoWidth > 0 && v.videoHeight > 0) {
              overlayCanvasRef.current.width = v.videoWidth;
              overlayCanvasRef.current.height = v.videoHeight;
            }
          }}
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            transform: isMirrorMode ? 'scaleX(-1)' : 'none',
            transformOrigin: 'center center',
          }}
        />

        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{
            transform: isMirrorMode ? 'scaleX(-1)' : 'none',
            transformOrigin: 'center center',
          }}
        />

        {/* Visual Neutral Pose Calibration Guide Overlay */}
        {isCalibrating && isCameraActive && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-between p-4 bg-slate-950/75 backdrop-blur-[2px] pointer-events-auto transition-all animate-fadeIn">
            {/* Top Calibration Header */}
            <div className="w-full max-w-sm flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 backdrop-blur-md shadow-lg">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
                </span>
                <div>
                  <div className="text-[11px] font-mono font-bold text-slate-100 uppercase tracking-wider">
                    Neutral Pose Alignment
                  </div>
                  <div className="text-[9.5px] font-mono text-slate-400">
                    Recording 0° baseline reference
                  </div>
                </div>
              </div>

              {onCancelCalibration && (
                <button
                  onClick={onCancelCalibration}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Cancel calibration"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Center: Interactive Palm Alignment Silhouette & Reticle */}
            <div className="relative flex flex-col items-center justify-center my-auto">
              {/* Outer Alignment Box Reticle */}
              <div
                className={`relative w-56 h-72 rounded-3xl border-2 flex items-center justify-center transition-all duration-300 ${
                  calibrationProgress >= 100
                    ? 'border-emerald-400 bg-emerald-950/30 shadow-[0_0_25px_rgba(52,211,153,0.35)]'
                    : isNeutralAligned
                    ? 'border-emerald-400 bg-emerald-950/20 shadow-[0_0_20px_rgba(52,211,153,0.25)]'
                    : isHandDetected
                    ? 'border-amber-400 bg-amber-950/20 shadow-[0_0_15px_rgba(251,191,36,0.2)]'
                    : 'border-cyan-500/50 bg-cyan-950/15 animate-pulse'
                }`}
              >
                {/* Corner reticles */}
                <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-cyan-400 rounded-tl" />
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-cyan-400 rounded-tr" />
                <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-cyan-400 rounded-bl" />
                <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-cyan-400 rounded-br" />

                {/* SVG Open Palm Neutral Silhouette */}
                <svg
                  viewBox="0 0 200 260"
                  className={`w-44 h-56 transition-all duration-300 drop-shadow ${
                    calibrationProgress >= 100
                      ? 'stroke-emerald-400 fill-emerald-500/20 text-emerald-400'
                      : isNeutralAligned
                      ? 'stroke-emerald-400 fill-emerald-500/15 text-emerald-400'
                      : isHandDetected
                      ? 'stroke-amber-400 fill-amber-500/15 text-amber-400'
                      : 'stroke-cyan-400/70 fill-cyan-500/10 text-cyan-400'
                  }`}
                  style={{ strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}
                >
                  {/* Wrist / Forearm base */}
                  <path d="M 80 250 L 80 220 C 70 215 60 205 55 190 L 50 170 C 45 155 35 150 25 155 C 18 158 18 170 25 178 L 45 205 C 55 220 65 240 70 250 Z" />

                  {/* Palm & 5 Fingers (Extended straight neutral) */}
                  {/* Thumb */}
                  <path d="M 52 170 C 40 150 30 135 32 120 C 34 110 44 112 48 122 L 62 152" />
                  {/* Index */}
                  <path d="M 68 140 L 68 50 C 68 38 82 38 82 50 L 82 135" />
                  {/* Middle */}
                  <path d="M 86 135 L 86 35 C 86 23 100 23 100 35 L 100 135" />
                  {/* Ring */}
                  <path d="M 104 135 L 104 48 C 104 36 118 36 118 48 L 118 138" />
                  {/* Pinky */}
                  <path d="M 122 140 L 122 75 C 122 65 134 65 134 75 L 134 155 C 134 190 120 225 110 250" />
                  {/* Palm outline closure */}
                  <path d="M 80 250 L 110 250" />

                  {/* Finger joint zero-angle reference lines (MCP / PIP / DIP) */}
                  <line x1="68" y1="75" x2="82" y2="75" strokeDasharray="2,2" opacity="0.6" />
                  <line x1="68" y1="105" x2="82" y2="105" strokeDasharray="2,2" opacity="0.6" />

                  <line x1="86" y1="65" x2="100" y2="65" strokeDasharray="2,2" opacity="0.6" />
                  <line x1="86" y1="98" x2="100" y2="98" strokeDasharray="2,2" opacity="0.6" />

                  <line x1="104" y1="75" x2="118" y2="75" strokeDasharray="2,2" opacity="0.6" />
                  <line x1="104" y1="105" x2="118" y2="105" strokeDasharray="2,2" opacity="0.6" />

                  <line x1="122" y1="98" x2="134" y2="98" strokeDasharray="2,2" opacity="0.6" />

                  {/* Palm Center Crosshair */}
                  <circle cx="93" cy="175" r="8" fill="none" opacity="0.7" />
                  <line x1="93" y1="162" x2="93" y2="188" opacity="0.7" />
                  <line x1="80" y1="175" x2="106" y2="175" opacity="0.7" />
                </svg>

                {/* Hand Presence / Alignment status badge inside reticle */}
                <div className="absolute bottom-2 inset-x-2 flex justify-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold flex items-center gap-1 border backdrop-blur-md shadow-xs ${
                      calibrationProgress >= 100
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : isNeutralAligned
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : isHandDetected
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-900/80 text-cyan-300 border-slate-700'
                    }`}
                  >
                    {calibrationProgress >= 100 ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>ZERO-ANGLE SET ✓</span>
                      </>
                    ) : isNeutralAligned ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        <span>ALIGNED — HOLD STEADY</span>
                      </>
                    ) : isHandDetected ? (
                      <>
                        <Hand className="w-3 h-3 text-amber-400" />
                        <span>OPEN PALM & EXTEND FINGERS</span>
                      </>
                    ) : (
                      <>
                        <Crosshair className="w-3 h-3 text-cyan-400 animate-spin" />
                        <span>PLACE PALM IN FRAME</span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Real-Time Progress Bar & Percentage */}
              <div className="w-56 mt-3 bg-slate-900/90 rounded-xl p-2.5 border border-slate-800 shadow-md">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 mb-1">
                  <span>SAMPLING BASELINE</span>
                  <span className="font-bold text-cyan-400">{Math.round(calibrationProgress)}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-150 rounded-full ${
                      calibrationProgress >= 100
                        ? 'bg-emerald-400'
                        : isNeutralAligned
                        ? 'bg-gradient-to-r from-cyan-400 to-emerald-400'
                        : 'bg-cyan-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, calibrationProgress))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Bottom 3-Step Instruction Guide */}
            <div className="w-full max-w-sm px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-[10.5px] font-sans text-slate-300 shadow-lg flex items-center justify-around gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px] flex items-center justify-center font-bold">1</span>
                <span>Palm to Cam</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px] flex items-center justify-center font-bold">2</span>
                <span>Fingers Flat</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px] flex items-center justify-center font-bold">3</span>
                <span>Hold 1s</span>
              </div>
            </div>
          </div>
        )}

        {/* Video Playback Controls Overlay when playing an uploaded video */}
        {isCameraActive && isVideoSource && (
          <div className="absolute top-3 inset-x-3 z-30 px-3 py-1.5 rounded-lg bg-white/95 border border-slate-200 shadow-md flex items-center justify-between text-xs backdrop-blur-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
              <span className="font-mono text-[11px] font-semibold text-slate-800 flex items-center gap-1">
                <Video className="w-3.5 h-3.5 text-sky-600" />
                VIDEO STREAM
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {onToggleVideoPlay && (
                <button
                  onClick={onToggleVideoPlay}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                  title={isVideoPlaying ? 'Pause video' : 'Play video'}
                >
                  {isVideoPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isVideoPlaying ? 'PAUSE' : 'PLAY'}</span>
                </button>
              )}

              {onRestartVideo && (
                <button
                  onClick={onRestartVideo}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                  title="Replay video from start"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>REPLAY</span>
                </button>
              )}

              <button
                onClick={onStartCamera}
                className="px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-mono text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                title="Switch back to live webcam"
              >
                <Camera className="w-3 h-3" />
                <span>USE WEBCAM</span>
              </button>
            </div>
          </div>
        )}

        {/* Model Loading Status Notification */}
        {visionModelStatus === 'loading' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-lg bg-white/95 border border-sky-300 text-sky-800 font-mono text-[11px] flex items-center gap-2 shadow-md backdrop-blur-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
            <span>{visionModelMessage || 'Loading MediaPipe vision models...'}</span>
          </div>
        )}

        {/* Camera Error In-UI Banner (Light Theme) */}
        {cameraError && (
          <div className="absolute inset-x-4 top-4 z-30 p-3.5 rounded-xl bg-white border border-rose-200 text-slate-800 shadow-xl backdrop-blur-md flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <div className="font-semibold text-rose-900 mb-0.5">Camera Hardware & Permission Notice</div>
              <div className="text-[11px] text-slate-600 leading-relaxed mb-2.5">{cameraError}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onStartCamera}
                  className="px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-medium text-[11px] transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Camera className="w-3 h-3" />
                  <span>Retry Camera</span>
                </button>

                {onStartDemoMode && (
                  <button
                    onClick={onStartDemoMode}
                    className="px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-medium text-[11px] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <PlayCircle className="w-3 h-3 text-amber-600" />
                    <span>Run Demo Mode</span>
                  </button>
                )}
              </div>
            </div>
            {onDismissCameraError && (
              <button
                onClick={onDismissCameraError}
                className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Inactive Camera Prompt */}
        {!isCameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center bg-slate-50/95 z-20 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-sky-600 mb-2.5 shadow-sm">
              <Camera className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 mb-0.5">
              Human Motion Input
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mb-3.5">
              Stream from your webcam to retarget full hand, arm, and gesture kinematics in real time.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-2 w-full max-w-xs">
              <button
                id="btn-start-camera-prompt"
                onClick={onStartCamera}
                disabled={isCameraLoading}
                className="w-full px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-sky-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-98 cursor-pointer disabled:cursor-not-allowed"
              >
                {isCameraLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    <span>Enable Webcam</span>
                  </>
                )}
              </button>
            </div>

            {onStartDemoMode && (
              <div className="mt-2.5">
                <button
                  onClick={onStartDemoMode}
                  className="text-[11px] font-mono text-sky-700 hover:text-sky-800 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <PlayCircle className="w-3 h-3" />
                  <span>Or test with Simulated Motion Demo</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Low Confidence or Lost Tracking Banner */}
        {isCameraActive && !isCalibrating && metrics.poseConfidence < poseConfidenceThreshold && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-md bg-amber-500 text-white font-mono text-[11px] font-semibold flex items-center gap-2 backdrop-blur-xs shadow-md border border-amber-600">
            <ShieldAlert className="w-4 h-4 text-white" />
            <span>LOW LIGHT / POSE CONFIDENCE BELOW {Math.round(poseConfidenceThreshold * 100)}%</span>
          </div>
        )}
      </div>

      {/* Footer Info Bar */}
      <div className="h-8 px-3 bg-white/95 border-t border-slate-200 flex items-center justify-between font-mono text-[10.5px] text-slate-600 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <span>
            POSE:{' '}
            <b
              className={
                metrics.poseConfidence > 0.5 ? 'text-emerald-700' : 'text-amber-700'
              }
            >
              {Math.round(metrics.poseConfidence * 100)}%
            </b>
          </span>

          <span className="flex items-center gap-1.5">
            HANDS:
            <span
              className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                leftHand.detected
                  ? 'bg-sky-50 text-sky-800 border border-sky-300'
                  : 'text-slate-400 bg-slate-100 border border-slate-200'
              }`}
              title="Left Hand Tracking"
            >
              L
            </span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                rightHand.detected
                  ? 'bg-sky-50 text-sky-800 border border-sky-300'
                  : 'text-slate-400 bg-slate-100 border border-slate-200'
              }`}
              title="Right Hand Tracking"
            >
              R
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">GESTURE:</span>
          <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[10px]">
            {gesture}
          </span>
        </div>
      </div>
    </div>
  );
};
