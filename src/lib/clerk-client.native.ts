import { tokenCache } from '@clerk/expo/token-cache';

export {
  ClerkProvider,
  useAuth,
  useClerk,
  useSSO,
  useUser,
} from '@clerk/expo';
// The legacy resource API — the ticket sign-in strategy
// (signIn.create({strategy:'ticket'}) + setActive, auth spec) needs it; the
// v3 "signals" useSignIn has a different shape and a bugged ticket path
// (clerk/javascript#8219).
export { useSignIn, useSignUp } from '@clerk/expo/legacy';
export { tokenCache };
