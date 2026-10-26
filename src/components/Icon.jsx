import { useId } from "react";

/*
  Ícones no espírito dos SF Symbols: preenchidos para navegação (como a HIG recomenda
  para barras de abas) e traço arredondado para ações. Grade 24×24.
*/
const F = { fill: "currentColor", stroke: "none" };

function Gear() {
  const id = useId();
  return (
    <>
      <mask id={id}>
        <rect width="24" height="24" fill="#fff" />
        <circle cx="12" cy="12" r="3" fill="#000" />
      </mask>
      <g mask={`url(#${id})`} {...F}>
        <circle cx="12" cy="12" r="7" />
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="10.4" y="1.6" width="3.2" height="4.4" rx="1.2" transform={`rotate(${i * 45} 12 12)`} />
        ))}
      </g>
    </>
  );
}

const icons = {
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" strokeWidth="2.4" /></>,
  "search.fill": (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" {...F} opacity="0.25" />
      <circle cx="10.5" cy="10.5" r="6.5" strokeWidth="2.4" />
      <path d="m15.6 15.6 5 5" strokeWidth="2.8" />
    </>
  ),
  "building.fill": (
    <path
      {...F}
      fillRule="evenodd"
      d="M11 3.5A1.5 1.5 0 0 1 12.5 2h7A1.5 1.5 0 0 1 21 3.5V21h-10V3.5ZM14 5.5h2V7.5h-2zM17 5.5h2V7.5h-2zM14 9.5h2v2h-2zM17 9.5h2v2h-2zM14 13.5h2v2h-2zM17 13.5h2v2h-2zM3 9.5A1.5 1.5 0 0 1 4.5 8H10v13H3V9.5ZM5 11h3v2H5zM5 15h3v2H5z"
    />
  ),
  "gear.fill": <Gear />,
  whatsapp: (
    <path
      {...F}
      d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.08-.12-.28-.2-.57-.34M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 7c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.42"
    />
  ),
  "phone.fill": (
    <path {...F} d="M7.2 3.1c.6-.6 1.6-.5 2.1.2l1.7 2.4c.4.6.4 1.4-.1 1.9l-1.1 1.1c-.2.2-.3.6-.1.9a13.6 13.6 0 0 0 4.7 4.7c.3.2.7.1.9-.1l1.1-1.1c.5-.5 1.3-.5 1.9-.1l2.4 1.7c.7.5.8 1.5.2 2.1l-1.2 1.2c-1 1-2.5 1.4-3.9.9A18 18 0 0 1 5.1 8.3c-.5-1.4-.1-2.9.9-3.9z" />
  ),
  "map.fill": <><path {...F} d="M12 22s7-5.9 7-11.6A7 7 0 0 0 5 10.4C5 16.1 12 22 12 22Z" /><circle cx="12" cy="10.2" r="2.6" fill="var(--icon-cut, #fff)" stroke="none" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="3.8" ry="9" /><path d="M3.5 9h17M3.5 15h17" /></>,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5.5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1.1" {...F} /></>,
  "envelope.fill": <><rect x="2.5" y="5" width="19" height="14" rx="3" {...F} /><path d="m4 7.5 8 6 8-6" stroke="var(--icon-cut, #fff)" strokeWidth="1.6" /></>,
  "person.fill": <><circle cx="12" cy="8" r="4.2" {...F} /><path {...F} d="M3.8 20.2c0-3.9 3.7-6.4 8.2-6.4s8.2 2.5 8.2 6.4c0 .5-.4.8-.8.8H4.6c-.4 0-.8-.3-.8-.8Z" /></>,
  key: <><circle cx="8" cy="15.5" r="4.5" /><path d="m11.3 12.3 8.2-8.2M16.5 7l2.5 2.5M14.3 9.2l2 2" strokeWidth="2.1" /></>,
  check: <path d="m4.5 12.5 4.8 4.8L19.5 7" strokeWidth="2.6" />,
  plus: <path d="M12 5v14M5 12h14" strokeWidth="2.4" />,
  sidebar: <><rect x="3" y="4.5" width="18" height="15" rx="3.5" /><path d="M9.5 4.5v15" /><path d="M5.5 8.5h1.5M5.5 11.5h1.5" strokeWidth="1.6" /></>,
  eye: <><path d="M2.75 12S6 5.75 12 5.75 21.25 12 21.25 12 18 18.25 12 18.25 2.75 12 2.75 12z" /><circle cx="12" cy="12" r="3" /></>,
  "eye.slash": <path d="M9.9 6a9.6 9.6 0 0 1 2.1-.25c6 0 9.25 6.25 9.25 6.25a17 17 0 0 1-2.4 3.3M6.3 7.6C3.95 9.3 2.75 12 2.75 12S6 18.25 12 18.25a9 9 0 0 0 4.6-1.25M4 4l16 16M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.75v1.9M12 19.35v1.9M4.2 4.2l1.35 1.35M18.45 18.45l1.35 1.35M2.75 12h1.9M19.35 12h1.9M4.2 19.8l1.35-1.35M18.45 5.55 19.8 4.2" /></>,
  moon: <path d="M19.9 14.6A8.25 8.25 0 0 1 9.4 4.1a8.25 8.25 0 1 0 10.5 10.5z" />,
  info: <><circle cx="12" cy="12" r="8.75" /><path d="M12 11v5.25M12 7.75v.1" strokeWidth="2.2" /></>,
  "check.circle.fill": <><circle cx="12" cy="12" r="10" {...F} /><path d="m7.5 12.3 3 3 6-6.3" stroke="var(--icon-cut, #fff)" strokeWidth="2.4" /></>,
  xmark: <path d="M6 6l12 12M18 6 6 18" strokeWidth="2.4" />,
  "exclamation.fill": <><path {...F} d="M10.3 3.6a2 2 0 0 1 3.4 0l8.1 14a2 2 0 0 1-1.7 3H3.9a2 2 0 0 1-1.7-3Z" /><path d="M12 9v4.5" stroke="var(--icon-cut, #fff)" strokeWidth="2.2" /><circle cx="12" cy="17" r="1.2" fill="var(--icon-cut, #fff)" stroke="none" /></>,
  "arrow.down.doc": <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M12 10.5v6M9.3 14l2.7 2.8 2.7-2.8" strokeWidth="2" /></>,
  "arrow.up.doc": <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M12 17v-6M9.3 13.5 12 10.7l2.7 2.8" strokeWidth="2" /></>,
  trash: <><path d="M4 6.5h16M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7" /><path d="M6.2 6.5 7 19a2 2 0 0 0 2 1.9h6a2 2 0 0 0 2-1.9l.8-12.5" /></>,
  "star.fill": <path {...F} d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9Z" />,
  chevron: <path d="m9 5 7 7-7 7" strokeWidth="2.4" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  retry: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4.5h-4.5" strokeWidth="2.2" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2.5" {...F} />,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  sparkles: <><path {...F} d="M10 3.5c.7 3.7 2.6 5.6 6.3 6.3-3.7.7-5.6 2.6-6.3 6.3-.7-3.7-2.6-5.6-6.3-6.3 3.7-.7 5.6-2.6 6.3-6.3Z" /><path {...F} d="M18 14c.3 1.6 1.1 2.4 2.7 2.7-1.6.3-2.4 1.1-2.7 2.7-.3-1.6-1.1-2.4-2.7-2.7 1.6-.3 2.4-1.1 2.7-2.7Z" /></>,
  "nosite": <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" strokeWidth="2.2" /></>,
  external: <><path d="M14 4h6v6M20 4l-8.5 8.5" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
};

export default function Icon({ name, size = 20, stroke = 2, className = "", label }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : "true"}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {icons[name]}
    </svg>
  );
}
