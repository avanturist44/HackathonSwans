import { STAGES, type Stage } from "@/lib/types";

const ATTORNEY_STAGES: Stage[] = ["intake", "treating", "records", "demand", "negotiation", "resolved"];
const PROVIDER_STAGES: Stage[] = ["treating", "records", "demand", "negotiation", "resolved"];

/**
 * Case progress bar. Litigation is only shown when the case is actually in it.
 * Steps before the current one are filled, the current one is ringed.
 */
export function StageBar({ current, audience }: { current: Stage; audience: "attorney" | "provider" }) {
  let ids = audience === "attorney" ? [...ATTORNEY_STAGES] : [...PROVIDER_STAGES];
  if (current === "litigation") {
    const at = ids.indexOf("resolved");
    ids.splice(at, 0, "litigation");
  }
  // A provider never sees intake; treat it as the first visible step.
  const effective: Stage = audience === "provider" && current === "intake" ? "treating" : current;
  const steps = ids.map((id) => STAGES.find((s) => s.id === id)!).filter(Boolean);
  const currentIdx = ids.indexOf(effective);

  return (
    <ol
      className="stagebar"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, listStyle: "none", margin: 0, padding: 0 }}
      aria-label="Case stage"
    >
      {steps.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "now" : "todo";
        const label = audience === "provider" ? s.providerLabel : s.label;
        return (
          <li key={s.id} className={`stage-step ${state}`} aria-current={state === "now" ? "step" : undefined}>
            <div className="stage-fill" />
            <div className="stage-label">
              {label}
              {state === "now" ? " · now" : ""}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
