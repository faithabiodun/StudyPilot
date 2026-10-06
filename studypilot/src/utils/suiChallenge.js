// Validate the entire server message before asking a wallet to sign it.
export function validateSuiChallenge(challenge, address, allowedOrigins, now = Date.now()) {
  const wallet = `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
  const issued = Date.parse(challenge?.issued_at);
  if (!allowedOrigins.includes(challenge?.origin) || challenge?.address !== wallet ||
      !/^[a-f0-9]{32}$/.test(challenge?.nonce || "") ||
      challenge?.expires_in !== 300 || !Number.isFinite(issued) ||
      issued > now + 60000 || issued + 300000 <= now) {
    throw new Error("The wallet sign-in request is invalid or expired. Please try again.");
  }
  const expected = "Sign in to StudyPilot\n\n" +
    "This signature proves you own this wallet. It is free and does not create a transaction.\n\n" +
    `Website: ${challenge.origin}\nWallet: ${wallet}\nNonce: ${challenge.nonce}\n` +
    `Issued at: ${new Date(issued).toISOString()}\nExpires at: ${new Date(issued + 300000).toISOString()}`;
  if (challenge.message !== expected) throw new Error("The wallet sign-in message does not match this website and wallet.");
  return expected;
}
