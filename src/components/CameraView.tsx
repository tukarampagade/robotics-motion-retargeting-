/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { Camera, FlipHorizontal, Maximize2, ShieldAlert, Sparkles, VideoOff } from 'lucide-react';
import { GestureType, HandTrackingState, TrackingMetrics } from '../types';

interface CameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  isCameraActive: boolean;
  isMirrorMode: boolean;
  gesture: GestureType;
  leftHand: HandTrackingState;
  rightHand: HandTrackingState;
  metrics: TrackingMetrics;
  onToggleMirror: () => void;
  onStartCamera: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  videoRef,
  overlayCanvasRef,
  isCameraActive,
  isMirrorMode,
  gesture,
  leftHand,
  rightHand,
  metrics,
  onToggleMirror,
  onStartCamera,
}) => {
  return (
    <div className="relative flex flex-col h-full bg-slate-900 border-r border-slate-200/80 overflow-hidden select-none">
      {/* View Header */}
      <div className="h-9 px-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 shrink-0 z-10">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="font-semibold text-slate-100 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            HUMAN VISION
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-cyan-400">{metrics.visionFps} FPS</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleMirror}
            className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border transition-colors ${
              isMirrorMode
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title="Mirror webcam preview (matches physical mirror)"
          >
            <FlipHorizontal className="w-3 h-3" />
            <span>MIRROR</span>
          </button>
        </div>
      </div>

      {/* Video & Canvas Container */}
      <div className="relative flex-1 bg-black flex items-center justify-center min-h-0 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            transform: isMirrorMode ? 'scaleX(-1)' : 'none',
          }}
        />

        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            transform: isMirrorMode ? 'scaleX(-1)' : 'none',
          }}
        />

        {/* Inactive Camera Prompt */}
        {!isCameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/95 z-20">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 mb-3 shadow-lg">
              <Camera className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100 mb-1">
              Webcam Feed Inactive
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mb-4">
              Connect your laptop webcam to drive the half-body humanoid robot in real-time.
            </p>
            <button
              id="btn-start-camera-prompt"
              onClick={onStartCamera}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Enable Webcam</span>
            </button>
          </div>
        )}

        {/* Low Confidence or Lost Tracking Banner */}
        {isCameraActive && metrics.poseConfidence < 0.35 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-md bg-amber-500/90 text-slate-950 font-mono text-[11px] font-semibold flex items-center gap-2 backdrop-blur-xs shadow-md border border-amber-400/40">
            <ShieldAlert className="w-4 h-4 text-slate-950" />
            <span>STAND BACK SO SHOULDERS ARE VISIBLE</span>
          </div>
        )}
      </div>

      {/* Footer Info Bar */}
      <div className="h-8 px-3 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between font-mono text-[10.5px] text-slate-400 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <span>
            POSE:{' '}
            <b
              className={
                metrics.poseConfidence > 0.5 ? 'text-emerald-400' : 'text-amber-400'
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
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-600'
              }`}
              title="Left Hand Tracking"
            >
              L
            </span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                rightHand.detected
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-600'
              }`}
              title="Right Hand Tracking"
            >
              R
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500">GESTURE:</span>
          <span className="font-bold text-slate-200 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-[10px]">
            {gesture}
          </span>
        </div>
      </div>
    </div>
  );
};
