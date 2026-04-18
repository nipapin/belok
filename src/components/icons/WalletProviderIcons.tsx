type IconProps = {
  className?: string;
  title?: string;
};

const APPLE_WALLET_GRADIENT_ID = 'belok-apple-wallet-rainbow';

/** Упрощённая «карта Pass» с радужной полосой — для кнопки Apple Wallet. */
export function AppleWalletMark({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient
          id={APPLE_WALLET_GRADIENT_ID}
          x1="6"
          y1="4"
          x2="6"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF2D55" />
          <stop offset="0.2" stopColor="#FF9500" />
          <stop offset="0.4" stopColor="#FFCC00" />
          <stop offset="0.55" stopColor="#34C759" />
          <stop offset="0.75" stopColor="#5AC8FA" />
          <stop offset="1" stopColor="#AF52DE" />
        </linearGradient>
      </defs>
      {/* задняя карта */}
      <rect x="5.5" y="8" width="13" height="10" rx="2" fill="currentColor" opacity="0.28" />
      {/* передняя карта */}
      <rect x="3" y="5" width="18" height="13" rx="2.5" fill="currentColor" />
      <rect x="3.5" y="5.5" width="5.5" height="12" rx="1.25" fill={`url(#${APPLE_WALLET_GRADIENT_ID})`} />
      <rect x="10" y="9.5" width="9" height="1.2" rx="0.4" fill="#0a0a0a" opacity="0.08" />
      <rect x="10" y="11.8" width="6" height="1" rx="0.35" fill="#0a0a0a" opacity="0.06" />
    </svg>
  );
}

/** Упрощённый знак Google Wallet: контур кошелька + цвета Google. */
export function GoogleWalletMark({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M6 10V9a3 3 0 013-3h6a3 3 0 013 3v1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M5 10.5h14a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2v-4.5a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="7.2" cy="15.5" r="1.15" fill="#EA4335" />
      <circle cx="9.9" cy="15.5" r="1.15" fill="#FBBC04" />
      <circle cx="12.6" cy="15.5" r="1.15" fill="#34A853" />
      <circle cx="15.3" cy="15.5" r="1.15" fill="#4285F4" />
    </svg>
  );
}
