const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

// Validate auth configuration at startup
if (!clerkDomain) {
  throw new Error(
    'CLERK_JWT_ISSUER_DOMAIN not set in Convex environment variables. ' +
      'Auth will not work. Set this in Convex Dashboard → Settings → Environment Variables. ' +
      'Value should be your full Clerk issuer URL, e.g., "https://clerk.njangi.app"'
  );
}

export default {
  providers: [
    {
      domain: clerkDomain,
      applicationID: 'convex',
    },
  ],
};
