import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppBackButton } from "@/components/AppBackButton";
import { StatsPlayerAvatar } from "@/components/stats/StatsPlayerAvatar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import styles from "./statsScreen.module.css";

type StatsScreenProps = {
  children: ReactNode;
  title?: string;
  summary?: string;
  profile?: {
    name: string;
    photoUrl?: string | null;
    summary?: string;
  };
};

export function StatsScreen({
  title,
  summary,
  profile,
  children,
}: StatsScreenProps) {
  return (
    <div className={styles.screen} data-stats-screen>
      <header className={styles.header}>
        {profile ? (
          <div className={styles.profileHero}>
            <div className={styles.titleRow}>
              <Suspense fallback={null}>
                <AppBackButton tone="dark" />
              </Suspense>
            </div>
            <StatsPlayerAvatar
              name={profile.name}
              photoUrl={profile.photoUrl}
              size="profile"
            />
            <h1 className={styles.profileName}>{profile.name}</h1>
            {profile.summary ? (
              <p className={styles.summary}>{profile.summary}</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className={styles.titleRow}>
              <Suspense fallback={null}>
                <AppBackButton tone="dark" />
              </Suspense>
              {title ? <h1 className={styles.title}>{title}</h1> : null}
            </div>
            {summary ? <p className={styles.summary}>{summary}</p> : null}
          </>
        )}
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}

type StatsListLinkProps = {
  href: string;
  title: string;
  badge?: string;
  meta?: string;
};

export function StatsListLink({
  href,
  title,
  badge,
  meta,
}: StatsListLinkProps) {
  return (
    <li>
      <Link href={href} className={styles.cardLink}>
        <div className={styles.cardRow}>
          <span className={styles.cardTitle}>{title}</span>
          {badge ? <span className={styles.cardBadge}>{badge}</span> : null}
        </div>
        {meta ? <p className={styles.cardMeta}>{meta}</p> : null}
      </Link>
    </li>
  );
}

type StatsPlayerLinkProps = {
  href: string;
  name: string;
  photoUrl?: string | null;
  title: string;
  badge?: string;
  meta?: string;
};

export function StatsPlayerLink({
  href,
  name,
  photoUrl,
  title,
  badge,
  meta,
}: StatsPlayerLinkProps) {
  return (
    <li>
      <Link href={href} className={styles.cardLink}>
        <div className={styles.cardLinkRow}>
          <StatsPlayerAvatar name={name} photoUrl={photoUrl} />
          <div className={styles.cardLinkBody}>
            <span className={styles.cardTitle}>{title}</span>
            {meta ? <p className={styles.cardMeta}>{meta}</p> : null}
          </div>
          {badge ? <span className={styles.cardBadge}>{badge}</span> : null}
        </div>
      </Link>
    </li>
  );
}

export function StatsList({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

export function StatsEmpty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

export function StatsLoading({ label }: { label?: string }) {
  return (
    <LoadingSpinner label={label ?? ""} className={styles.loading} />
  );
}
