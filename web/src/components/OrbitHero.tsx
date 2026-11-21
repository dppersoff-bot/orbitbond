// Lightweight static hero: pure SVG + native SMIL animation, no dependency.
// Illustrative only — not to scale.
export function OrbitHero() {
  return (
    <svg viewBox="0 0 420 420" className="h-full w-full" role="img"
      aria-label="Illustration : la Terre, un satellite conforme qui désorbite et un satellite en retard">
      <defs>
        <radialGradient id="ob-earth" cx="38%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="55%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0b1530" />
        </radialGradient>
        <radialGradient id="ob-atmo" cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor="#38d9f5" stopOpacity="0" />
          <stop offset="92%" stopColor="#38d9f5" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#38d9f5" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ob-night" x1="0" y1="0" x2="1" y2="0">
          <stop offset="45%" stopColor="#02040a" stopOpacity="0" />
          <stop offset="100%" stopColor="#02040a" stopOpacity="0.7" />
        </linearGradient>
        <path id="ob-orbit-a" d="M 70 210 A 140 58 -18 1 1 350 210 A 140 58 -18 1 1 70 210" />
        <path id="ob-orbit-b" d="M 40 210 A 170 92 24 1 1 380 210 A 170 92 24 1 1 40 210" />
        <path id="ob-deorbit" d="M 350 210 C 330 270 280 290 245 262 C 232 252 226 244 222 236" />
      </defs>

      {/* Earth */}
      <circle cx="210" cy="210" r="118" fill="url(#ob-atmo)" />
      <circle cx="210" cy="210" r="96" fill="url(#ob-earth)" />
      <g opacity="0.22" fill="#7dd3fc">
        <path d="M168 150c14-8 34-6 42 6s-4 22-18 24-30 10-34-2 0-22 10-28z" />
        <path d="M232 214c16-4 30 6 30 20s-12 30-26 30-18-14-16-26 0-20 12-24z" />
        <path d="M150 228c10 0 18 8 16 18s-12 14-20 10-8-28 4-28z" />
      </g>
      <circle cx="210" cy="210" r="96" fill="url(#ob-night)" />

      {/* Orbit A — compliant (cyan) */}
      <use href="#ob-orbit-a" fill="none" stroke="#38d9f5" strokeOpacity="0.55" strokeWidth="1.2" />
      {/* Orbit B — overdue (orange, dashed) */}
      <use href="#ob-orbit-b" fill="none" stroke="#f97316" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="5 6" />

      {/* Satellite A: orbits, then deorbits with a re-entry trail */}
      <g>
        <circle r="5" fill="#38d9f5">
          <animateMotion dur="9s" repeatCount="indefinite"><mpath href="#ob-orbit-a" /></animateMotion>
        </circle>
        <circle r="11" fill="#38d9f5" opacity="0.18">
          <animateMotion dur="9s" repeatCount="indefinite"><mpath href="#ob-orbit-a" /></animateMotion>
        </circle>
      </g>
      <use href="#ob-deorbit" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 5" opacity="0.7" />
      <circle r="4" fill="#fde68a">
        <animateMotion dur="4s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.5 0 1 1">
          <mpath href="#ob-deorbit" />
        </animateMotion>
        <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="4s" repeatCount="indefinite" />
      </circle>

      {/* Satellite B: still in orbit after its deadline, pulsing alert */}
      <g>
        <circle r="5" fill="#f97316">
          <animateMotion dur="14s" repeatCount="indefinite"><mpath href="#ob-orbit-b" /></animateMotion>
        </circle>
        <circle r="6" fill="none" stroke="#ef4444" strokeWidth="1.5">
          <animateMotion dur="14s" repeatCount="indefinite"><mpath href="#ob-orbit-b" /></animateMotion>
          <animate attributeName="r" values="6;18" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.9;0" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* Legend */}
      <g fontFamily="ui-monospace, monospace" fontSize="10" letterSpacing="1">
        <circle cx="24" cy="380" r="4" fill="#38d9f5" />
        <text x="34" y="384" fill="#a5b4c8">DÉSORBITÉ À TEMPS → CAUTION RENDUE</text>
        <circle cx="24" cy="400" r="4" fill="#f97316" />
        <text x="34" y="404" fill="#a5b4c8">ÉCHÉANCE MANQUÉE → FONDS DE DÉPOLLUTION</text>
      </g>
    </svg>
  );
}
