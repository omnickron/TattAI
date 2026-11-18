import "server-only";
import { prisma } from "../db";
import { createCalendarClient } from "../google/client";
import { APP_TIMEZONE } from "../format";
import { createPushSender } from "../push";
import type { SchedulingDeps } from "./booking";

export function schedulingDeps(): SchedulingDeps {
  return {
    prisma,
    calendar: createCalendarClient(),
    timeZone: APP_TIMEZONE,
    appUrl: process.env.APP_URL,
    push: createPushSender(),
  };
}
