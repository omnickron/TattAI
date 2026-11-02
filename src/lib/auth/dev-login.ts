/** Developer login with sample users. Hard-disabled in production builds. */
export function isDevLoginEnabled(): boolean {
  return process.env.DEV_LOGIN_ENABLED === "true" && process.env.NODE_ENV !== "production";
}
