import type { CalendarClient } from "./calendar";
import { GoogleCalendarClient } from "./google-calendar";
import { isCalendarMock, MockCalendarClient } from "./mock-calendar";

export function createCalendarClient(): CalendarClient {
  return isCalendarMock() ? new MockCalendarClient() : new GoogleCalendarClient();
}
