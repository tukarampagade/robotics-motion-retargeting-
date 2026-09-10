/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { GestureResult, RobotControlConfig, DEFAULT_ROBOT_CONFIG } from '../types/robot';
import { classifyHandSign, LandmarkPoint2D } from '../utils/gestureClassifier';

interface UseHandGestureRecognitionOptions {
  config?: Partial<RobotControlConfig>;
  onStableGestureChange?: (result: GestureResult) => void;
  onNoHandTimeout?: () => void;
}

export function useHandGestureRecognition({
  config: userConfig,
  onStableGestureChange,
  onNoHandTimeout,
}: UseHandGestureRecognitionOptions = {}) {
  const config = { ...DEFAULT_ROBOT_CONFIG, ...userConfig };

  // Recognition state is kept strictly separate from UI state:
  // Raw instantaneous frame classifications are stored in mutable refs to prevent 60 FPS React re-renders.
  // React state is ONLY updated when stable gesture transitions or hand presence status flips.
  const rawGestureRef = useRef<GestureResult>({
    gesture: 'NO_HAND',
    command: 'STOP',
    confidence: 0,
    timestamp: Date.now(),
  });

  const [stableGesture, setStableGesture] = useState<GestureResult>({
    gesture: 'NO_HAND',
    command: 'STOP',
    confidence: 0,
    timestamp: Date.now(),
  });

  const [isHandDetected, setIsHandDetected] = useState<boolean>(false);
  const isHandDetectedRef = useRef<boolean>(false);

  // Buffer tracking consecutive frames of the candidate gesture
  const candidateGestureRef = useRef<GestureResult['gesture']>('NO_HAND');
  const candidateCountRef = useRef<number>(0);
  const [candidateCount, setCandidateCount] = useState<number>(0);
  const stableGestureRef = useRef<GestureResult>({
    gesture: 'NO_HAND',
    command: 'STOP',
    confidence: 0,
    timestamp: Date.now(),
  });

  // Timestamp of the last valid hand detection for no-hand watchdog
  const lastHandDetectionTimeRef = useRef<number>(Date.now());
  const lastProcessedTimeRef = useRef<number>(0);
  const minIntervalMs = 1000 / Math.max(1, config.processingFps);

  // Watchdog timer checking for no-hand timeout (500ms default)
  useEffect(() => {
    const interval = setInterval(() => {
      const timeSinceLastHand = Date.now() - lastHandDetectionTimeRef.current;
      if (timeSinceLastHand > config.noHandStopTimeoutMs) {
        if (stableGestureRef.current.gesture !== 'NO_HAND' || stableGestureRef.current.command !== 'STOP') {
          const stopResult: GestureResult = {
            gesture: 'NO_HAND',
            command: 'STOP',
            confidence: 0,
            timestamp: Date.now(),
          };
          candidateGestureRef.current = 'NO_HAND';
          candidateCountRef.current = 0;
          rawGestureRef.current = stopResult;
          stableGestureRef.current = stopResult;
          setStableGesture(stopResult);
          setCandidateCount(0);
          if (isHandDetectedRef.current) {
            isHandDetectedRef.current = false;
            setIsHandDetected(false);
          }
          onNoHandTimeout?.();
          onStableGestureChange?.(stopResult);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [config.noHandStopTimeoutMs, onNoHandTimeout, onStableGestureChange]);

  const processFrame = useCallback(
    (
      landmarks?: LandmarkPoint2D[] | null,
      handConfidence: number = 1.0,
      isMirrored: boolean = true
    ): GestureResult => {
      const now = Date.now();

      // FPS throttling: process frames at controlled rate (default 12-15 FPS)
      if (now - lastProcessedTimeRef.current < minIntervalMs) {
        return stableGestureRef.current;
      }
      lastProcessedTimeRef.current = now;

      // Classify raw gesture without triggering React renders
      const result = classifyHandSign(
        landmarks,
        config.minHandConfidence,
        handConfidence,
        isMirrored
      );
      rawGestureRef.current = result;

      // Track hand presence and watchdog timestamp
      const hasHand = Boolean(landmarks && landmarks.length >= 21 && handConfidence >= config.minHandConfidence);
      if (hasHand) {
        lastHandDetectionTimeRef.current = now;
      }
      if (isHandDetectedRef.current !== hasHand) {
        isHandDetectedRef.current = hasHand;
        setIsHandDetected(hasHand);
      }

      // Stability filter: require consecutive frames of identical gesture
      if (result.gesture === candidateGestureRef.current) {
        candidateCountRef.current += 1;
      } else {
        // Prevent rapid flickering: If an active directional command (FORWARD, BACKWARD, LEFT, RIGHT)
        // is currently held, a single transient UNKNOWN / MIRRORING frame is tolerated without immediately dropping
        const isStableActive = stableGestureRef.current.command !== 'STOP';
        const isGlitchFrame = (result.gesture === 'UNKNOWN' || result.gesture === 'MIRRORING') && result.confidence > 0.3;

        if (isStableActive && isGlitchFrame && candidateCountRef.current >= config.gestureStabilityFrames) {
          // Gracefully hold active gesture through single-frame noise
          return stableGestureRef.current;
        }

        candidateGestureRef.current = result.gesture;
        candidateCountRef.current = 1;
      }

      // Fail-safe STOP if no hand detected
      const isSafetyStop = result.command === 'STOP';
      const meetsStability =
        candidateCountRef.current >= config.gestureStabilityFrames ||
        (isSafetyStop && result.gesture === 'NO_HAND');

      if (meetsStability && stableGestureRef.current.gesture !== result.gesture) {
        stableGestureRef.current = result;
        setStableGesture(result);
        setCandidateCount(candidateCountRef.current);
        onStableGestureChange?.(result);
      }

      return result;
    },
    [
      config.gestureStabilityFrames,
      config.minHandConfidence,
      minIntervalMs,
      onStableGestureChange,
    ]
  );

  /**
   * Two-hand independent gesture processing:
   * Evaluates both hands independently so neither hand's state corrupts the other.
   * Prioritizes intentional active navigation gestures (FORWARD/BACKWARD/LEFT/RIGHT).
   */
  const processHands = useCallback(
    (
      leftHand?: { detected: boolean; confidence: number; landmarks?: LandmarkPoint2D[] } | null,
      rightHand?: { detected: boolean; confidence: number; landmarks?: LandmarkPoint2D[] } | null,
      isMirrored: boolean = true
    ): GestureResult => {
      const leftValid = Boolean(leftHand?.detected && leftHand.landmarks && leftHand.landmarks.length >= 21);
      const rightValid = Boolean(rightHand?.detected && rightHand.landmarks && rightHand.landmarks.length >= 21);

      if (!leftValid && !rightValid) {
        return processFrame(null, 0, isMirrored);
      }
      if (leftValid && !rightValid) {
        return processFrame(leftHand!.landmarks, leftHand!.confidence, isMirrored);
      }
      if (!leftValid && rightValid) {
        return processFrame(rightHand!.landmarks, rightHand!.confidence, isMirrored);
      }

      // Both hands are present: classify both independently
      const leftRes = classifyHandSign(leftHand!.landmarks, config.minHandConfidence, leftHand!.confidence, isMirrored);
      const rightRes = classifyHandSign(rightHand!.landmarks, config.minHandConfidence, rightHand!.confidence, isMirrored);

      const leftIsActive = leftRes.command !== 'STOP';
      const rightIsActive = rightRes.command !== 'STOP';

      // If one hand has an intentional active command and the other is idle/mirroring, prioritize active command
      if (leftIsActive && !rightIsActive) {
        return processFrame(leftHand!.landmarks, leftHand!.confidence, isMirrored);
      }
      if (rightIsActive && !leftIsActive) {
        return processFrame(rightHand!.landmarks, rightHand!.confidence, isMirrored);
      }

      // If both or neither have active commands, choose the hand with higher confidence or matching current gesture
      if (leftRes.gesture === stableGestureRef.current.gesture) {
        return processFrame(leftHand!.landmarks, leftHand!.confidence, isMirrored);
      }
      if (rightRes.gesture === stableGestureRef.current.gesture) {
        return processFrame(rightHand!.landmarks, rightHand!.confidence, isMirrored);
      }

      const dominantHand = (rightHand!.confidence >= leftHand!.confidence) ? rightHand! : leftHand!;
      return processFrame(dominantHand.landmarks, dominantHand.confidence, isMirrored);
    },
    [config.minHandConfidence, processFrame]
  );

  const resetGestureState = useCallback(() => {
    const stopResult: GestureResult = {
      gesture: 'NO_HAND',
      command: 'STOP',
      confidence: 0,
      timestamp: Date.now(),
    };
    candidateGestureRef.current = 'NO_HAND';
    candidateCountRef.current = 0;
    rawGestureRef.current = stopResult;
    stableGestureRef.current = stopResult;
    setStableGesture(stopResult);
    setCandidateCount(0);
    isHandDetectedRef.current = false;
    setIsHandDetected(false);
  }, []);

  return {
    currentGesture: stableGesture,
    stableGesture,
    isHandDetected,
    processFrame,
    processHands,
    resetGestureState,
    candidateCount,
    getRawGesture: () => rawGestureRef.current,
  };
}
