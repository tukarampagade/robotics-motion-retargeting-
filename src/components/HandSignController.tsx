/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Compass,
  Hand,
  OctagonX,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react';
import {
  GestureResult,
  RobotCommand,
  RobotConnectionStatus,
  RobotControlConfig,
  RobotDriveState,
} from '../types/robot';
import { GestureStatus } from './GestureStatus';
import { RobotControls } from './RobotControls';

interface HandSignControllerProps {
  gestureResult: GestureResult;
  isHandDetected: boolean;
  activeCommand: RobotCommand;
  driveState: RobotDriveState;
  connectionStatus: RobotConnectionStatus;
  latencyMs: number;
  config: RobotControlConfig;
  onUpdateConfig: (newConfig: Partial<RobotControlConfig>) => void;
  onSetCommand: (command: RobotCommand, source?: string) => void;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
  isEmergencyStopped: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  isDocked?: boolean;
}

export const HandSignController: React.FC<HandSignControllerProps> = ({
  gestureResult,
  isHandDetected,
  activeCommand,
  driveState,
  connectionStatus,
  latencyMs,
  config,
  onUpdateConfig,
  onSetCommand,
  onEmergencyStop,
  onResetEmergencyStop,
  isEmergencyStopped,
  isOpen = true,
  onClose,
  isDocked = false,
}) => {
  const [showConfig, setShowConfig] = useState<boolean>(false);

  if (!isOpen) return null;

  const containerClasses = isDocked
    ? 'w-88 h-full bg-white border-l border-slate-200 p-4 font-sans select-none text-slate-800 flex flex-col justify-between overflow-y-auto shrink-0 z-10 shadow-xs'
    : 'absolute top-16 right-4 w-88 bg-white/95 border border-slate-200 rounded-2xl shadow-xl backdrop-blur-md z-40 p-4 font-sans select-none text-slate-800 animate-in fade-in zoom-in-95 duration-150 max-h-[calc(100vh-5rem)] overflow-y-auto';

  const gestureMappings = [
    {
      gesture: 'Thumb Up',
      cmd: 'FORWARD',
      icon: <ArrowUp className="w-3.5 h-3.5 text-emerald-600" />,
      desc: 'Move forward',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      gesture: 'Thumb Down',
      cmd: 'BACKWARD',
      icon: <ArrowDown className="w-3.5 h-3.5 text-amber-600" />,
      desc: 'Move backward',
      color: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      gesture: 'Point/Tilt Left',
      cmd: 'LEFT',
      icon: <ArrowLeft className="w-3.5 h-3.5 text-sky-600" />,
      desc: 'Rotate left',
      color: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    {
      gesture: 'Point/Tilt Right',
      cmd: 'RIGHT',
      icon: <ArrowRight className="w-3.5 h-3.5 text-sky-600" />,
      desc: 'Rotate right',
      color: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    {
      gesture: 'Open Palm',
      cmd: 'STOP',
      icon: <OctagonX className="w-3.5 h-3.5 text-rose-600" />,
      desc: 'Immediate stop',
      color: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    {
      gesture: 'Closed Fist',
      cmd: 'STOP',
      icon: <OctagonX className="w-3.5 h-3.5 text-rose-600" />,
      desc: 'Immediate stop',
      color: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    {
      gesture: 'No Hand in View',
      cmd: 'STOP',
      icon: <Shield className="w-3.5 h-3.5 text-slate-500" />,
      desc: 'Auto watchdog stop (500ms)',
      color: 'bg-slate-50 text-slate-700 border-slate-200',
    },
  ];

  return (
    <div className={containerClasses}>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shadow-2xs">
              <Hand className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                Hand-Sign Robot Control
              </h2>
              <p className="text-[11px] text-slate-500">
                Safe gesture teleoperation with watchdog
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                showConfig
                  ? 'bg-sky-50 text-sky-600 border-sky-200'
                  : 'text-slate-400 hover:text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title="Configure parameters"
            >
              <Settings className="w-4 h-4" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Live Gesture HUD status */}
        <GestureStatus
          gestureResult={gestureResult}
          isHandDetected={isHandDetected}
          minConfidence={config.minHandConfidence}
          requiredFrames={config.gestureStabilityFrames}
          className="mb-3"
        />

        {/* Direction Controls & Manual Emergency Stop */}
        <RobotControls
          activeCommand={activeCommand}
          onSetCommand={onSetCommand}
          onEmergencyStop={onEmergencyStop}
          onResetEmergencyStop={onResetEmergencyStop}
          isEmergencyStopped={isEmergencyStopped}
          connectionStatus={connectionStatus}
          latencyMs={latencyMs}
          className="mb-3"
        />

        {/* Parameters Config Drawer */}
        {showConfig && (
          <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-100">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200 text-slate-700 font-bold">
              <span className="flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-sky-600" />
                Safety & Recognition Tuning
              </span>
              <button
                onClick={() =>
                  onUpdateConfig({
                    minHandConfidence: 0.75,
                    processingFps: 12,
                    gestureStabilityFrames: 3,
                    commandDebounceMs: 250,
                    noHandStopTimeoutMs: 500,
                  })
                }
                className="text-[10px] text-sky-600 hover:underline cursor-pointer"
              >
                Defaults
              </button>
            </div>

            {/* Min Confidence Slider */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-600 font-medium">
                  Min Hand Confidence
                </span>
                <span className="font-mono font-bold text-slate-800">
                  {Math.round(config.minHandConfidence * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={config.minHandConfidence}
                onChange={e =>
                  onUpdateConfig({ minHandConfidence: parseFloat(e.target.value) })
                }
                className="w-full accent-sky-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
              />
            </div>

            {/* Processing FPS */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-600 font-medium">Vision Rate (FPS)</span>
                <span className="font-mono font-bold text-slate-800">
                  {config.processingFps} FPS
                </span>
              </div>
              <input
                type="range"
                min="8"
                max="24"
                step="1"
                value={config.processingFps}
                onChange={e =>
                  onUpdateConfig({ processingFps: parseInt(e.target.value, 10) })
                }
                className="w-full accent-sky-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
              />
            </div>

            {/* Stability Frames */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-600 font-medium">Stability Frames</span>
                <span className="font-mono font-bold text-slate-800">
                  {config.gestureStabilityFrames} frames
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="6"
                step="1"
                value={config.gestureStabilityFrames}
                onChange={e =>
                  onUpdateConfig({
                    gestureStabilityFrames: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-sky-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
              />
            </div>

            {/* No Hand Watchdog Timeout */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-600 font-medium">
                  No-Hand Watchdog Stop
                </span>
                <span className="font-mono font-bold text-slate-800">
                  {config.noHandStopTimeoutMs} ms
                </span>
              </div>
              <input
                type="range"
                min="200"
                max="1000"
                step="50"
                value={config.noHandStopTimeoutMs}
                onChange={e =>
                  onUpdateConfig({
                    noHandStopTimeoutMs: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-sky-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Gesture Protocol Reference Guide */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Compass className="w-3 h-3 text-slate-400" />
            Sign Protocol Mapping
          </div>

          <div className="grid grid-cols-1 gap-1">
            {gestureMappings.map((m, idx) => (
              <div
                key={idx}
                className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                  activeCommand === m.cmd && !isEmergencyStopped
                    ? 'ring-1 ring-sky-500 ' + m.color
                    : 'bg-slate-50/70 border-slate-200/80 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-white flex items-center justify-center border border-slate-200/60 shadow-2xs">
                    {m.icon}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 text-[11px]">
                      {m.gesture}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1.5 hidden sm:inline">
                      ({m.desc})
                    </span>
                  </div>
                </div>

                <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-white/80 border border-slate-200/60 uppercase">
                  {m.cmd}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer / Robot Locomotion Telemetry */}
      <div className="mt-4 pt-3 border-t border-slate-200 text-[10px] font-mono text-slate-500 flex items-center justify-between">
        <div>
          POS: ({driveState.x.toFixed(2)}, {driveState.z.toFixed(2)})
        </div>
        <div>
          HEADING: {((driveState.rotationY * 180) / Math.PI).toFixed(0)}°
        </div>
        <div>
          SPD: {driveState.speed.toFixed(2)} m/s
        </div>
      </div>
    </div>
  );
};
