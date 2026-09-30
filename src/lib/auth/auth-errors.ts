export function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (normalized.includes("already registered") || normalized.includes("already been registered")) return "An account with this email already exists. Try signing in instead.";
  if (normalized.includes("password should be")) return "Choose a password with at least 8 characters.";
  if (normalized.includes("email") && normalized.includes("invalid")) return "Enter a valid email address.";
  if (normalized.includes("expired")) return "Your session has expired. Please sign in again.";
  return "We couldn't complete that request. Please try again.";
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
