"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TOURNAMENT_VARIANT_LABEL } from "@/lib/tournament/variant";
import { DartsLogo } from "./DartsLogo";
import { RulesOverlay } from "./RulesOverlay";
import styles from "./home.module.css";

const AUTHOR_URL =
  process.env.NEXT_PUBLIC_AUTHOR_TELEGRAM ?? "https://t.me/maxartemyev";
const DONATE_URL =
  "https://www.tinkoff.ru/rm/r_jYlOawoeMB.WceHmZoDCZ/qLBux70520";

type HomeScreenProps = {
  channelId: string | null;
  loading: boolean;
  error: string | null;
  isChannelAdmin?: boolean;
  appMode?: "guest" | "extended";
  onRetry?: () => void;
  onUnlockExtended?: (code: string) => Promise<boolean>;
  onSwitchToGuest?: () => void;
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
  appMode = "guest",
  onRetry,
  onUnlockExtended,
  onSwitchToGuest,
}: HomeScreenProps) {
  const router = useRouter();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [codeValue, setCodeValue] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const guest = appMode === "guest";
  const ready = Boolean(channelId) && !loading;
  const showStatus =
    !guest &&
    (loading || Boolean(error) || (!loading && !channelId && !error));

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const go = (href: string | null) => {
    if (!href) return;
    router.push(href);
  };

  const openAuthor = () => {
    window.open(AUTHOR_URL, "_blank", "noopener,noreferrer");
  };

  const openDonate = () => {
    window.open(DONATE_URL, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!aboutOpen && !codeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAboutOpen(false);
        setCodeOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [aboutOpen, codeOpen]);

  const submitCode = async () => {
    if (!onUnlockExtended) return;
    setCodeBusy(true);
    setCodeError(null);
    try {
      const ok = await onUnlockExtended(codeValue);
      if (!ok) {
        setCodeError("Неверный код");
        return;
      }
      setCodeOpen(false);
      setCodeValue("");
    } finally {
      setCodeBusy(false);
    }
  };

  return (
    <div className={styles.screen} data-home-screen>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <DartsLogo />
          <p className={styles.locationLabel}>
            {guest ? "Временная игра" : "Красная Поляна"}
          </p>
          {!guest && offline && (
            <p className={styles.offlineLabel} role="status">
              Офлайн — игры сохраняются на устройстве
            </p>
          )}
        </div>
      </header>

      <main
        className={[styles.content, guest ? styles.contentGuest : null]
          .filter(Boolean)
          .join(" ")}
      >
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

        <div
          className={[
            styles.playModesGroup,
            guest ? styles.playModesGuest : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {!guest && (
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
          )}

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

          {guest ? (
            <Button
              size="small"
              variant="secondary"
              fullWidth
              onClick={() => setRulesOpen(true)}
            >
              Правила
            </Button>
          ) : null}
        </div>

        {!guest && (
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
        )}

        <div className={styles.footerBlock}>
          {!guest && isChannelAdmin && (
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
            size="big"
            variant="secondary"
            fullWidth
            onClick={() => setAboutOpen(true)}
          >
            Купить автору пива
          </Button>
          {guest ? (
            <button
              type="button"
              className={styles.clubLink}
              onClick={() => {
                setCodeError(null);
                setCodeOpen(true);
              }}
            >
              Вход по коду
            </button>
          ) : (
            <button
              type="button"
              className={styles.clubLink}
              onClick={() => onSwitchToGuest?.()}
            >
              Временная игра
            </button>
          )}
        </div>
      </main>

      <RulesOverlay open={guest && rulesOpen} onClose={() => setRulesOpen(false)} />

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
              Купить автору пива
            </h2>
            <div className={styles.aboutBody}>
              <p>
                Сделал это приложение сам: без спонсоров и&nbsp;без чужой
                поддержки. Хостинг, сервисы и&nbsp;разработка&nbsp;— всё за мой
                счёт.
              </p>
              <p>
                Если оно вам помогает на вечерах и&nbsp;турнирах, буду рад любой
                поддержке.
              </p>
            </div>
            <Button
              size="medium"
              variant="secondary"
              fullWidth
              onClick={openDonate}
            >
              Перевести в Т-Банк
            </Button>
            <button
              type="button"
              className={styles.clubLink}
              onClick={openAuthor}
            >
              Написать автору
            </button>
          </div>
        </div>
      )}

      {codeOpen && (
        <div
          className={styles.aboutBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="club-code-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCodeOpen(false);
          }}
        >
          <div className={styles.aboutPanel}>
            <h2 id="club-code-title" className={styles.aboutTitle}>
              Вход по коду
            </h2>
            <p className={styles.aboutBody}>
              Введите код, чтобы открыть расширенный клуб со статистикой и
              турнирами. Состав временной игры останется на этом устройстве.
            </p>
            <input
              className={styles.codeInput}
              type="password"
              autoComplete="off"
              inputMode="text"
              placeholder="Код"
              value={codeValue}
              onChange={(e) => setCodeValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCode();
              }}
            />
            {codeError ? (
              <p className={styles.statusError} role="alert">
                {codeError}
              </p>
            ) : null}
            <Button
              size="medium"
              variant="secondary"
              fullWidth
              disabled={codeBusy || !codeValue.trim()}
              onClick={() => void submitCode()}
            >
              Войти
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
