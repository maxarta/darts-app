"use client";

import styles from "./tournament.module.css";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronOpen : styles.chevronClosed}`}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
  titleClassName?: string;
  children: React.ReactNode;
};

export function CollapsibleSection({
  title,
  meta,
  open,
  onToggle,
  className,
  titleClassName,
  children,
}: Props) {
  const sectionClass = [styles.section, className].filter(Boolean).join(" ");
  const titleClass = [styles.sectionTitle, titleClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={sectionClass}>
      <button
        type="button"
        className={styles.sectionToggle}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={styles.sectionToggleText}>
          <span className={titleClass}>{title}</span>
          {meta ? <span className={styles.sectionMeta}>{meta}</span> : null}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open ? <div className={styles.sectionBody}>{children}</div> : null}
    </section>
  );
}
