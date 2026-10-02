import type { BodyRegion, Diagnosis } from "@/lib/types";

/**
 * Back-view body figure with one marker per diagnosis. Back view, so the
 * patient's left side is on the viewer's left.
 */
const REGION_XY: Record<Exclude<BodyRegion, "other">, [number, number]> = {
  head: [36, 15],
  neck: [36, 29],
  left_shoulder: [22, 38],
  right_shoulder: [50, 38],
  upper_back: [36, 46],
  chest: [36, 52],
  abdomen: [36, 64],
  lower_back: [36, 74],
  hip: [36, 84],
  left_arm: [13, 56],
  right_arm: [59, 56],
  left_hand: [13, 80],
  right_hand: [59, 80],
  left_knee: [28, 121],
  right_knee: [44, 121],
  left_leg: [28, 140],
  right_leg: [44, 140],
};

const REGION_NAME: Record<BodyRegion, string> = {
  head: "head",
  neck: "neck",
  left_shoulder: "left shoulder",
  right_shoulder: "right shoulder",
  upper_back: "upper back",
  lower_back: "lower back",
  chest: "chest",
  abdomen: "abdomen",
  left_arm: "left arm",
  right_arm: "right arm",
  left_hand: "left hand",
  right_hand: "right hand",
  hip: "hip",
  left_knee: "left knee",
  right_knee: "right knee",
  left_leg: "left leg",
  right_leg: "right leg",
  other: "other",
};

const FILL = "#EEF1F5";
const LINE = "#C7CEDA";
const MARK = "#B42318";

export function BodyMap({ diagnoses }: { diagnoses: Diagnosis[] }) {
  // One marker per region; a primary diagnosis in a region wins the larger marker.
  const regions = new Map<Exclude<BodyRegion, "other">, boolean>();
  for (const d of diagnoses) {
    if (d.bodyRegion === "other" || !(d.bodyRegion in REGION_XY)) continue;
    const r = d.bodyRegion as Exclude<BodyRegion, "other">;
    regions.set(r, (regions.get(r) ?? false) || d.primary);
  }
  const names = [...regions.keys()].map((r) => REGION_NAME[r]);
  const label = names.length
    ? `Body map, back view: ${joinList(names)} injured`
    : "Body map, back view: no injured region recorded";

  return (
    <svg role="img" aria-label={label} width="72" height="160" viewBox="0 0 72 160" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="36" cy="15" r="11" fill={FILL} stroke={LINE} strokeWidth="1.5" />
      <rect x="31" y="25" width="10" height="8" fill={FILL} stroke={LINE} strokeWidth="1.5" />
      <rect x="8" y="35" width="10" height="48" rx="5" fill={FILL} stroke={LINE} strokeWidth="1.5" />
      <rect x="54" y="35" width="10" height="48" rx="5" fill={FILL} stroke={LINE} strokeWidth="1.5" />
      <rect x="22" y="88" width="12" height="66" rx="6" fill={FILL} stroke={LINE} strokeWidth="1.5" />
      <rect x="38" y="88" width="12" height="66" rx="6" fill={FILL} stroke={LINE} strokeWidth="1.5" />
      <rect x="20" y="32" width="32" height="56" rx="9" fill={FILL} stroke={LINE} strokeWidth="1.5" />
      {[...regions.entries()].map(([region, primary]) => {
        const [cx, cy] = REGION_XY[region];
        const r = primary ? 5 : 3.5;
        return (
          <g key={region}>
            <circle cx={cx} cy={cy} r={r * 2} fill={MARK} fillOpacity="0.18" />
            <circle cx={cx} cy={cy} r={r} fill={MARK} />
          </g>
        );
      })}
    </svg>
  );
}

function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
