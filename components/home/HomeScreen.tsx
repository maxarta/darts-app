"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TOURNAMENT_VARIANT_LABEL } from "@/lib/tournament/variant";
import { DartsLogo } from "./DartsLogo";
import styles from "./home.module.css";

const AUTHOR_URL =
  process.env.NEXT_PUBLIC_AUTHOR_TELEGRAM ?? "https://t.me/maxartemyev";

type HomeScreenProps = {
  channelId: string | null;
  loading: boolean;
  error: string | null;
  isChannelAdmin?: boolean;
  onRetry?: () => void;
};

function buildPath(
  base: string,
  channelId: string | null,
  extra?: Record<string, string>
) {
  if (!channelId) return null;
  const q = new URLSearchParams({ channelId, ...extra });
  return `${base}?${q.toString()}`;
}

export function HomeScreen({
  channelId,
  loading,
  error,
  isChannelAdmin = false,
  onRetry,
}: HomeScreenProps) {
  const router = useRouter();
  const [aboutOpen, setAboutOpen] = useState(false);
  const ready = Boolean(channelId) && !loading;
  const showStatus = loading || Boolean(error) || (!loading && !channelId && !error);

  const go = (href: string | null) => {
    if (!href) return;
    router.push(href);
  };

  const openAuthor = () => {
    window.open(AUTHOR_URL, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!aboutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAboutOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [aboutOpen]);

  return (
    <div className={styles.screen} data-home-screen>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <DartsLogo />
          <p className={styles.locationLabel}>Красная Поляна</p>
        </div>

      </header>

      <main className={styles.content}>
        {showStatus && (
          <div className={styles.statusBlock}>
            {loading && (
              <LoadingSpinner
                label="Загрузка…"
                className={styles.statusSpinner}
              />
            )}
            {error && (
              <p className={styles.statusError} role="alert">
                {error}
                {onRetry && (
                  <Button
                    size="small"
                    variant="primary"
                    className={styles.statusRetry}
                    onClick={onRetry}
                  >
                    Повторить
                  </Button>
                )}
              </p>
            )}
            {!loading && !channelId && !error && (
              <p className={styles.status}>
                Не удалось открыть клуб. Нажмите «Повторить».
              </p>
            )}
          </div>
        )}
        <div className={styles.playModesGroup}>
          <button
            type="button"
            className={styles.tournamentCard}
            disabled={!ready}
            onClick={() => go(buildPath("/tournament/new", channelId))}
          >
            <div className={styles.trophyWrap}>
              <div className={styles.trophyInner}>
                <Image
                  src="/home/trophy.png"
                  alt=""
                  width={91}
                  height={91}
                  className={styles.trophy}
                  priority
                />
              </div>
            </div>
            <span className={styles.tournamentLabel}>Турнир</span>
          </button>

          <div className={styles.modeRow}>
          <button
            type="button"
            className={styles.modeCard}
            disabled={!ready}
            onClick={() =>
              go(buildPath("/game/new", channelId, { mode: "501" }))
            }
          >
            501
          </button>
          <button
            type="button"
            className={styles.modeCard}
            disabled={!ready}
            onClick={() =>
              go(buildPath("/game/new", channelId, { mode: "301" }))
            }
          >
            301
          </button>
          </div>
        </div>

        <nav className={styles.bottomNav} aria-label="Навигация">
          <Button
            href={buildPath("/stats/players", channelId) ?? "#"}
            size="small"
            variant="secondary"
            fullWidth
            className={styles.navBtn}
            disabled={!ready}
          >
            Участники
          </Button>
          <Button
            href={buildPath("/stats", channelId) ?? "#"}
            size="small"
            variant="secondary"
            fullWidth
            className={styles.navBtn}
            disabled={!ready}
          >
            Статистика
          </Button>
          <Button
            href={buildPath("/stats/current", channelId) ?? "#"}
            size="small"
            variant="secondary"
            fullWidth
            className={styles.navBtn}
            disabled={!ready}
          >
            Текущие игры
          </Button>
          <Button
            href={buildPath("/stats/games", channelId) ?? "#"}
            size="small"
            variant="secondary"
            fullWidth
            className={styles.navBtn}
            disabled={!ready}
          >
            Архив
          </Button>
        </nav>

        <div className={styles.footerBlock}>
          {isChannelAdmin && (
            <button
              type="button"
              className={[styles.tournamentCard, styles.kennyCard]
                .filter(Boolean)
                .join(" ")}
              disabled={!ready}
              onClick={() =>
                go(
                  buildPath("/tournament/new", channelId, {
                    variant: "kenny",
                  })
                )
              }
            >
              <span className={styles.tournamentLabel}>
                {TOURNAMENT_VARIANT_LABEL.kenny}
              </span>
            </button>
          )}
          <Button
            size="small"
            variant="secondary"
            onClick={() => setAboutOpen(true)}
          >
            О приложении
          </Button>
        </div>
      </main>

      {aboutOpen && (
        <div
          className={styles.aboutBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAboutOpen(false);
          }}
        >
          <div className={styles.aboutPanel}>
            <h2 id="about-title" className={styles.aboutTitle}>
              О приложении
            </h2>
            <div className={styles.aboutBody}>
              <p>
                Приложение создано по личной инициативе и&nbsp;без какой либо
                поддержки. За все сервисы и&nbsp;разработку платил и плачу я
                сам. Хотите задонатить&nbsp;—&nbsp;буду только рад.
              </p>
              <p>
                Для всех критиков и других осуждающих, просьба проследовать в
                долгое, больше и&nbsp;длинное эротическое путешествие.
              </p>
            </div>
            <Button
              size="medium"
              variant="secondary"
              fullWidth
              onClick={openAuthor}
            >
              Написать автору
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
