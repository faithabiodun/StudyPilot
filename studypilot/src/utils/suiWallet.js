// Authentication needs message signing, not transaction permissions.
export function supportsSuiSignIn(wallet) {
  return Boolean(wallet.features["sui:signPersonalMessage"] || wallet.features["sui:signMessage"]);
}

// Invoke the wallet synchronously from the click handler so web-wallet popups
// keep the browser's user activation. Fetch the server challenge beforehand.
export function signWalletPersonalMessage(wallet, account, message) {
  const feature = wallet?.features["sui:signPersonalMessage"];
  if (feature) return feature.signPersonalMessage({ account, message, chain: "sui:mainnet" });
  const legacy = wallet?.features["sui:signMessage"];
  if (legacy) return legacy.signMessage({ account, message }).then(({ signature, messageBytes }) => ({ signature, bytes: messageBytes }));
  throw new Error("This wallet cannot sign personal messages. Please choose another Sui wallet.");
}
