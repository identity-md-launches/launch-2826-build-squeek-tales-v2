export type IconName =
  | "arrow"
  | "book"
  | "trophy"
  | "sparkles"
  | "bridge"
  | "home"
  | "clock"
  | "leaf"
  | "check"
  | "close"
  | "external"
  | "wallet"
  | "info"
  | "refresh"
  | "chevron"
  | "moon"
  | "sun"
  | "bolt"
  | "seed"
  | "download";
const paths: Record<IconName, React.ReactNode> = {
  arrow: (
    <>
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </>
  ),
  book: (
    <>
      <path d="M12 5C8 2 4 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-3-1-6-1-10 1Zm0 0v15" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 3h10v5c0 4-2 6-5 6s-5-2-5-6V3Zm0 2H3v3c0 3 2 4 5 4m9-7h4v3c0 3-2 4-5 4m-4 2v6m-4 1h8" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7-1v4m-2-2h4M4 18v4m-2-2h4" />
    </>
  ),
  bridge: (
    <>
      <path d="M3 7v13M21 7v13M3 9c5 7 13 7 18 0M3 17h18M7 13v4m5-3v3m5-4v4" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7" />
      <path d="m17 6 0-3h3v5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 3C8 1 2 7 5 15c8 5 16-1 15-12ZM4 21l11-12" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  external: (
    <>
      <path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-7" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 8V4H4a2 2 0 0 0 0 4h17v12H4a2 2 0 0 1-2-2V6m19 6h-6v4h6" />
      <path d="M17 14h.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v.1" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7a9 9 0 0 0-15-1L2 9m0-6v6h6m-4 8a9 9 0 0 0 15 1l3-3m0 6v-6h-6" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  moon: <path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />,
  seed: (
    <>
      <path d="M7 20C-1 12 7 2 19 3c2 12-4 23-12 17ZM7 20 16 7" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
};
export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
