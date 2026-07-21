export {
  ClerkProvider,
  useAuth,
  useClerk,
  useUser,
} from '@clerk/expo';

// Do not export @clerk/expo/legacy here. Its resource hooks depend on the
// native Clerk context and crash the web bundle at module evaluation time.
// Web auth uses Clerk's hosted modal through credentials-auth-form.web.
export const tokenCache = undefined;
