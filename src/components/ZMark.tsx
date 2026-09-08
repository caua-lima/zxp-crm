/**
 * Marca "Z" angulosa da ZXP Solutions.
 *
 * Mesmo desenho usado na landing page da RUMO — é a mesma casa, e o painel
 * não deveria parecer outro produto. Herda a cor por `currentColor`, então o
 * contêiner decide se ela sai dourada, marfim ou apagada.
 */
export function ZMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="7"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M10 10.5H22L11 21.5H22"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
