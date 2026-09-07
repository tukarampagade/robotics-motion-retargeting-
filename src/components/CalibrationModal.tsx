/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check, Compass, ShieldCheck, X } from 'lucide-react';
import { CalibrationData } from '../types';

interface CalibrationModalProps {
  calibration: CalibrationData;
  onCancel: () => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  calibration,
  onCancel,
}) => {
  if (!calibration.isCalibrating) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm select-none p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 p-6 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-14 h-14 rounded-2xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600 mx-auto mb-4">
          <Compass className="w-7 h-7" />
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-1">
          Calibrating Robot Neutral Stance
        </h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
          Stand in front of the camera with your shoulders and hips visible. Keep your arms relaxed at your sides and hold still.
        </p>

        {/* Circular Progress Gauge */}
        <div className="relative w-28 h-28 mx-auto mb-5 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="56"
              cy="56"
              r="48"
              stroke="#e2e8f0"
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="56"
              cy="56"
              r="48"
              stroke="#00b4d8"
              strokeWidth="6"
              fill="none"
              strokeDasharray={301.6}
              strokeDashoffset={301.6 - (301.6 * calibration.progress) / 100}
              strokeLinecap="round"
              className="transition-all duration-100 ease-linear"
            />
          </svg>
          <span className="absolute font-mono text-xl font-bold text-slate-800">
            {Math.round(calibration.progress)}%
          </span>
        </div>

        <p className="font-mono text-xs text-cyan-700 font-medium mb-6">
          {calibration.progress < 100
            ? 'Sampling body dimensions and neutral shoulder width...'
            : 'Calibration complete! Linking kinematics...'}
        </p>

        <button
          onClick={onCancel}
          className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold font-mono transition-colors"
        >
          Cancel Calibration
        </button>
      </div>
    </div>
  );
};
