/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  CheckCircle2,
  CircleDot,
  Hand,
  Minimize2,
  MousePointerClick,
  Sparkles,
  ThumbsUp,
  Zap,
} from 'lucide-react';
import { GestureType, HandTrackingState } from '../types';

interface GestureCommandCenterProps {
  currentGesture: GestureType;
  leftHand: HandTrackingState;
  rightHand: HandTrackingState;
  onClose?: () => void;
  accentColor?: 'cyan' | 'indigo' | 'emerald' | 'amber';
}

interface GestureItem {
  id: GestureType;
  title: string;
  commandDesc: string;
  robotReaction: string;
  icon: React.ReactNode;
  hint: string;
}

export const GestureCommandCenter: React.FC<GestureCommandCenterProps> = ({
  currentGesture,
  leftHand,
  rightHand,
  onClose,
  accentColor = 'cyan',
}) => {
  const gesturesList: GestureItem[] = [
    {
      id: 'WAVE',
      title: 'Wave Greeting',
      commandDesc: 'Oscillating open palm above shoulder',
      robotReaction: 'Waves hand back with responsive head tilt',
      icon: <span className="text-xl">👋</span>,
      hint: 'Raise hand above chest level and gently swing left to right',
    },
    {
      id: 'PINCH',
      title: 'Precision Pinch',
      commandDesc: 'Thumb and index fingertips touching (< 4cm)',
      robotReaction: 'Actuates precision dual-finger end effector',
      icon: <Minimize2 className="w-5 h-5 text-cyan-600" />,
      hint: 'Bring index fingertip to touch thumb tip',
    },
    {
      id: 'FIST',
      title: 'Power Grasp / Fist',
      commandDesc: 'All five fingers tightly curled into palm',
      robotReaction: 'Engages object pickup or firm power grasp',
      icon: <CircleDot className="w-5 h-5 text-amber-600" />,
      hint: 'Make a full fist with fingers closed',
    },
    {
      id: 'THUMBS_UP',
      title: 'Thumbs Up',
      commandDesc: 'Thumb extended vertically upwards, fingers curled',
      robotReaction: 'Robot mirrors approval gesture with affirmative nod',
      icon: <ThumbsUp className="w-5 h-5 text-emerald-600" />,
      hint: 'Extend thumb straight up with other fingers closed',
    },
    {
      id: 'VICTORY',
      title: 'Victory / Peace',
      commandDesc: 'Index and middle fingers extended in V-shape',
      robotReaction: 'Articulates two-finger victory sign on humanoid hand',
      icon: <span className="text-xl">✌️</span>,
      hint: 'Extend index and middle fingers upwards with ring/pinky closed',
    },
    {
      id: 'POINT',
      title: 'Index Point',
      commandDesc: 'Index finger extended forward, others curled',
      robotReaction: 'Directs humanoid gaze and pointing finger toward target',
      icon: <MousePointerClick className="w-5 h-5 text-indigo-600" />,
      hint: 'Point index finger forward',
    },
    {
      id: 'OPEN_PALM',
      title: 'Open Palm',
      commandDesc: 'All five fingers fully splayed and extended',
      robotReaction: 'Releases held workbench objects / returns to neutral standby',
      icon: <Hand className="w-5 h-5 text-slate-600" />,
      hint: 'Open hand wide with fingers spread apart',
    },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 border-l border-slate-200 overflow-y-auto select-none font-sans text-slate-800">
      {/* Panel Header */}
      <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-white/95 sticky top-0 z-10 backdrop-blur-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shadow-2xs">
            <Hand className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 leading-tight">Gesture Command Center</h3>
            <p className="text-[10px] text-slate-500 leading-tight font-mono">
              Biomechanical hand pose recognition library
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-mono text-[11px] font-bold shadow-2xs">
            ACTIVE: {currentGesture || 'NONE'}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Hand Detection Live Feedback Bar */}
      <div className="p-3.5 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-slate-700 font-mono text-[11px]">Vision Hand Tracking Streams</span>
          <span className="font-mono text-[10.5px] text-slate-500">21 3D Landmarks / Hand</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div
            className={`p-3 rounded-xl border transition-all ${
              leftHand.detected
                ? 'bg-sky-50/80 border-sky-300 text-sky-900 shadow-2xs'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-800 font-mono">Left Hand</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  leftHand.detected ? 'bg-sky-500 animate-pulse' : 'bg-slate-300'
                }`}
              />
            </div>
            <div className="text-[11px] font-mono text-slate-600">
              Confidence: {Math.round(leftHand.confidence * 100)}%
            </div>
            <div className="text-[11px] font-mono text-slate-600 mt-0.5">
              Pinch Dist: {(leftHand.pinchDistance * 100).toFixed(1)} cm
            </div>
          </div>

          <div
            className={`p-3 rounded-xl border transition-all ${
              rightHand.detected
                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 shadow-2xs'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-800 font-mono">Right Hand</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  rightHand.detected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                }`}
              />
            </div>
            <div className="text-[11px] font-mono text-slate-600">
              Confidence: {Math.round(rightHand.confidence * 100)}%
            </div>
            <div className="text-[11px] font-mono text-slate-600 mt-0.5">
              Pinch Dist: {(rightHand.pinchDistance * 100).toFixed(1)} cm
            </div>
          </div>
        </div>
      </div>

      {/* Gestures Cards Grid */}
      <div className="p-3.5 flex flex-col gap-2.5 flex-1">
        <div className="text-xs font-bold text-slate-700 font-mono">SUPPORTED HUMANOID GESTURES</div>
        {gesturesList.map(item => {
          const isActive = currentGesture === item.id;
          return (
            <div
              key={item.id}
              className={`p-3 rounded-xl border transition-all duration-150 ${
                isActive
                  ? 'bg-sky-50/90 border-sky-400 shadow-xs ring-1 ring-sky-300'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                      isActive
                        ? 'bg-sky-100 border-sky-300 shadow-2xs text-sky-700'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {item.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                      {isActive && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-sky-600 text-white animate-pulse">
                          DETECTED
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.commandDesc}</p>
                  </div>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700 font-mono text-[10.5px]">Robot:</span>
                  <span className="text-slate-600">{item.robotReaction}</span>
                </div>
                <div className="text-[10px] text-slate-400 italic">{item.hint}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
