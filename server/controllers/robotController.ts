/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { robotCommandService } from '../services/robotCommandService';
import { RobotCommand } from '../../src/types/robot';

export class RobotController {
  public static handleCommand(req: Request, res: Response): void {
    const { command, source, confidence } = req.body as {
      command: RobotCommand;
      source?: string;
      confidence?: number;
    };

    const result = robotCommandService.executeCommand(
      command,
      source || 'client_gesture',
      typeof confidence === 'number' ? confidence : 1.0
    );

    res.json({
      ok: result.ok,
      command: result.command,
      emergencyStopped: result.emergencyStopped,
      timestamp: Date.now(),
    });
  }

  public static handleEmergencyStop(req: Request, res: Response): void {
    const { reason } = req.body || {};
    robotCommandService.emergencyStop(reason || 'manual_e_stop_button');
    res.json({
      ok: true,
      command: 'STOP',
      emergencyStopped: true,
      timestamp: Date.now(),
    });
  }

  public static handleResetEmergencyStop(req: Request, res: Response): void {
    robotCommandService.resetEmergencyStop();
    res.json({
      ok: true,
      command: 'STOP',
      emergencyStopped: false,
      timestamp: Date.now(),
    });
  }

  public static handleGetStatus(_req: Request, res: Response): void {
    const status = robotCommandService.getStatus();
    res.json(status);
  }
}
