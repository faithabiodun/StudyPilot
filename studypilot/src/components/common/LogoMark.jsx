export default function LogoMark({ className = "h-11 w-11", rounded = "rounded-2xl" }) {
  return (
    <img
      src="/logo.svg"
      alt=""
      aria-hidden="true"
      className={`${className} ${rounded} object-contain shadow-soft`}
    />
  );
}
