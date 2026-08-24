export const SUI_BLUE = "#4DA2FF";

/**
 * Sui droplet mark.
 *
 * Two variants:
 *  - "tile" (default) matches the official app icon: white droplet on a Sui
 *    blue rounded square, so it reads as the Sui brand next to a Google button.
 *  - "mono" draws the droplet alone in currentColor, for places that need the
 *    icon to take the surrounding text colour.
 *
 * Hand-drawn approximation of the official artwork, not the trademarked file.
 */
export default function SuiLogo({ size = 18, variant = "tile", className = "" }) {
  const droplet = (
    <path
      d="M50 16c0 0 23 27.5 23 41.2C73 70.4 62.7 81 50 81S27 70.4 27 57.2C27 43.5 50 16 50 16Z"
      fill={variant === "tile" ? "#FFFFFF" : "currentColor"}
    />
  );

  // The S is negative space: a wedge cut through the droplet, curving down the
  // left and hooking back to the right.
  const swoosh = (
    <path
      d="M44.6 31.5c-6.2 8.4-9.4 15.2-9.4 21.1 0 8.4 6.5 14.9 15 14.9 2.6 0 5-.6 7-1.6.4-6.8-2.8-11.2-8.4-15.9-4.6-3.9-6.6-7.2-5.9-11.4.3-2 1.1-4.2 1.7-7.1Z"
      fill={variant === "tile" ? SUI_BLUE : "currentColor"}
      opacity={variant === "tile" ? 1 : 0.35}
    />
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {variant === "tile" && <rect width="100" height="100" rx="22" fill={SUI_BLUE} />}
      {droplet}
      {swoosh}
    </svg>
  );
}
