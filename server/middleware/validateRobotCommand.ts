/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';
import { RobotCommand } from '../../src/types/robot';

export const ALLOWED_ROBOT_COMMANDS: ReadonlySet<string> = new Set<RobotCommand>([
  'FORWARD',
  'BACKWARD',
  'LEFT',
  'RIGHT',
  'STOP',
]);

export function isValidRobotCommand(cmd: unknown): cmd is RobotCommand {
  return typeof cmd === 'string' && ALLOWED_ROBOT_COMMANDS.has(cmd);
}

export function validateRobotCommandMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { command } = req.body || {};

  if (!command) {
    res.status(400).json({
      ok: false,
      error: 'Missing required "command" parameter in request body.',
      allowedCommands: Array.from(ALLOWED_ROBOT_COMMANDS),
    });
    return;
  }

  if (!isValidRobotCommand(command)) {
    res.status(400).json({
      ok: false,
      error: `Invalid command "${command}". Permitted values are FORWARD, BACKWARD, LEFT, RIGHT, STOP.`,
      allowedCommands: Array.from(ALLOWED_ROBOT_COMMANDS),
    });
    return;
  }

  next();
}
