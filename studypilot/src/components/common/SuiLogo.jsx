/**
 * Sui "droplet" mark, drawn as a path so it inherits currentColor and stays
 * crisp at any size. Decorative here: the button beside it carries the label.
 */
export default function SuiLogo({ size = 18, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 0C16 0 0 18.2 0 26.2 0 33.8 7.2 40 16 40s16-6.2 16-13.8C32 18.2 16 0 16 0Zm0 34.6c-5.5 0-10-3.8-10-8.4 0-4.3 6.4-13.4 10-18.2 3.6 4.8 10 13.9 10 18.2 0 4.6-4.5 8.4-10 8.4Z"
        fill="currentColor"
      />
      <path
        d="M16 11.4c-3 4.1-7.4 10.8-7.4 14.2 0 3.5 3.3 6.3 7.4 6.3s7.4-2.8 7.4-6.3c0-3.4-4.4-10.1-7.4-14.2Z"
        fill="currentColor"
        opacity="0.45"
      />
    </svg>
  );
}
