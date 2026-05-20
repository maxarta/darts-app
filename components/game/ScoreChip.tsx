import chipStyles from "./scoreChip.module.css";

type Variant = "white" | "dark" | "slot" | "bust";
type WhiteTone = "visitBar" | "scoreboard";

type Props = {
  variant: Variant;
  /** Размер текста для белого чипа (визит-бар vs панель игрока) */
  whiteTone?: WhiteTone;
  children?: React.ReactNode;
  className?: string;
  "aria-hidden"?: boolean;
};

export function ScoreChip({
  variant,
  whiteTone = "visitBar",
  children,
  className,
  "aria-hidden": ariaHidden,
}: Props) {
  const classes = [
    chipStyles.chip,
    variant === "white" && chipStyles.white,
    variant === "white" &&
      (whiteTone === "scoreboard"
        ? chipStyles.whiteScoreboard
        : chipStyles.whiteVisitBar),
    variant === "dark" && chipStyles.dark,
    variant === "slot" && chipStyles.slot,
    variant === "bust" && chipStyles.bust,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} aria-hidden={ariaHidden}>
      {children}
    </span>
  );
}
