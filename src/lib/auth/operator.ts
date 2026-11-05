/**
 * The operator of NEEDL (you, not the studio): may change operator-only settings such as the
 * billing details. Set on the server as OPERATOR_EMAIL; without it nobody can edit them in the app.
 */
export function isOperator(user: { email: string } | null | undefined): boolean {
  const op = process.env.OPERATOR_EMAIL?.trim().toLowerCase();
  return Boolean(op && user?.email && user.email.trim().toLowerCase() === op);
}
