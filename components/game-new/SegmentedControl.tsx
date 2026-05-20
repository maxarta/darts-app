import type { ScoringRule } from "@/lib/darts/rules";
import { OptionSegmented } from "@/components/game-new/OptionSegmented";

const OPTIONS: { value: ScoringRule; label: string }[] = [
  { value: "straight", label: "Просто" },
  { value: "double", label: "Удвоением" },
  { value: "bull", label: "Булл" },
];

type SegmentedControlProps = {
  value: ScoringRule;
  onChange: (value: ScoringRule) => void;
  name: string;
};

export function SegmentedControl({
  value,
  onChange,
  name,
}: SegmentedControlProps) {
  return (
    <OptionSegmented
      name={name}
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />
  );
}
