import React from 'react';

/**
 * Official SVG Logo Components for Payment Terminal Providers
 */

export const WorldlineLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 170 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M4 6L11 30H18L11 6H4Z" fill="#00E5B3" />
    <path d="M14 6L21 30H28L21 6H14Z" fill="#00C49F" />
    <path d="M24 6L31 30H38L31 6H24Z" fill="#009E82" />
    <text x="46" y="25" fill="#002938" fontFamily="Inter, system-ui, sans-serif" fontWeight="900" fontSize="19" letterSpacing="-0.5px">
      worldline
    </text>
  </svg>
);

export const CCVLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 120 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="120" height="36" rx="7" fill="#E30613" />
    <text x="14" y="25" fill="#FFFFFF" fontFamily="Arial Black, Impact, sans-serif" fontWeight="900" fontSize="20" fontStyle="italic" letterSpacing="1px">
      CCV
    </text>
    <path d="M90 9L103 18L90 27" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SumUpLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 140 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="2" y="3" width="30" height="30" rx="8" fill="#0F172A" />
    <path d="M11 12C11 10.3 12.3 9 14 9H20C21.7 9 23 10.3 23 12C23 13.7 21.7 15 20 15H14C12.3 15 11 16.3 11 18C11 19.7 12.3 21 14 21H20C21.7 21 23 19.7 23 18" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
    <text x="38" y="25" fill="#0F172A" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="20" letterSpacing="-0.5px">
      sumup
    </text>
  </svg>
);

export const MollieLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 130 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <text x="2" y="25" fill="#000000" fontFamily="Inter, system-ui, sans-serif" fontWeight="900" fontSize="22" letterSpacing="-1px">
      mollie
    </text>
    <circle cx="112" cy="12" r="3.5" fill="#FF4F00" />
  </svg>
);

export const VivaWalletLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 150 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="18" cy="18" r="14" fill="url(#viva-grad)" />
    <path d="M11 14L18 22L25 14" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <text x="38" y="24" fill="#111827" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="18">
      viva.com
    </text>
    <defs>
      <linearGradient id="viva-grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF0055" />
        <stop offset="1" stopColor="#E60000" />
      </linearGradient>
    </defs>
  </svg>
);

export const VerifoneLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 150 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M4 8H15L11 28H0L4 8Z" fill="#E20074" />
    <text x="22" y="25" fill="#002D62" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="20" letterSpacing="-0.5px">
      Verifone
    </text>
  </svg>
);
