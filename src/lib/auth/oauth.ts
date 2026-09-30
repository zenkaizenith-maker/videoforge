/**
 * Add enabled Supabase OAuth providers here when they are configured in the
 * Supabase dashboard. Keeping this list empty hides unfinished providers.
 */
export const oauthProviders = [] as const;
export type OAuthProvider = (typeof oauthProviders)[number];
