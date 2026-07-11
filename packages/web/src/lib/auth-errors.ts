/**
 * better-auth's client surfaces English error messages; the UI is all-Greek,
 * so translate the codes we recognize and fall back to a Greek generic —
 * never the raw English pass-through (#176).
 */
interface BetterAuthError {
  code?: string | undefined;
  message?: string | undefined;
  status?: number;
}

const CODE_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Λάθος email ή κωδικός",
  USER_NOT_FOUND: "Λάθος email ή κωδικός",
  INVALID_PASSWORD: "Λάθος email ή κωδικός",
  INVALID_EMAIL: "Μη έγκυρο email",
  PASSWORD_TOO_SHORT: "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες",
  PASSWORD_TOO_LONG: "Ο κωδικός είναι πολύ μεγάλος",
  INVALID_TOKEN: "Ο σύνδεσμος δεν είναι πλέον έγκυρος",
};

export function authErrorMessage(error: BetterAuthError, fallback: string): string {
  if (error.status === 429) {
    return "Πολλές προσπάθειες — δοκιμάστε ξανά σε λίγα λεπτά";
  }
  return (error.code && CODE_MESSAGES[error.code]) || fallback;
}
