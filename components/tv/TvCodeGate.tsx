"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api/client";
import { normalizeTvCode, TV_CODE_LENGTH } from "@/lib/tournament/tv-code";
import { TV_PUBLIC_HOST } from "@/lib/tournament/tv-live";
import styles from "./tv.module.css";

export type TvResolvedBoard = {
  boardKey: string;
  kind: "tournament" | "game" | "channel";
  refId: string;
  tournamentId: string | null;
  gameId: string | null;
  title: string;
};

type Props = {
  onResolved: (board: TvResolvedBoard) => void;
};

/** PIN entry on bare `/tv` — type the 4-digit code from the phone. */
export function TvCodeGate({ onResolved }: Props) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (code: string) => {
    const normalized = normalizeTvCode(code);
    if (normalized.length !== TV_CODE_LENGTH) {
      setError("Введите 4 цифры");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        boardKey: string;
        kind: "tournament" | "game" | "channel";
        refId: string;
        title?: string;
        tournamentId: string | null;
        gameId: string | null;
      }>(`/api/tv/${encodeURIComponent(normalized)}`);
      onResolved({
        boardKey: res.boardKey,
        kind: res.kind,
        refId: res.refId,
        tournamentId: res.tournamentId,
        gameId: res.gameId,
        title: res.title ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Код не найден");
      setDigits("");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(digits);
  };

  const pushDigit = (d: string) => {
    if (loading) return;
    setError(null);
    const next = normalizeTvCode(digits + d);
    setDigits(next);
    if (next.length === TV_CODE_LENGTH) {
      void submit(next);
    }
  };

  const backspace = () => {
    setError(null);
    setDigits((prev) => prev.slice(0, -1));
  };

  return (
    <div className={styles.tvGate}>
      <p className={styles.tvBrand}>TV · {TV_PUBLIC_HOST}/tv</p>
      <h1 className={styles.tvGateTitle}>Код</h1>
      <p className={styles.tvGateHint}>
        Введите 4 цифры с экрана телефона
      </p>

      <form className={styles.tvGateForm} onSubmit={onSubmit}>
        <div className={styles.tvGateSlots} aria-label="Код">
          {Array.from({ length: TV_CODE_LENGTH }, (_, i) => (
            <span key={i} className={styles.tvGateSlot}>
              {digits[i] ?? "·"}
            </span>
          ))}
        </div>

        {error ? <p className={styles.tvGateError}>{error}</p> : null}
        {loading ? <p className={styles.tvGateHint}>Проверяем…</p> : null}

        <div className={styles.tvGatePad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(
            (key, i) => {
              if (key === "") {
                return <span key={`empty-${i}`} />;
              }
              if (key === "⌫") {
                return (
                  <button
                    key="bs"
                    type="button"
                    className={styles.tvGateKey}
                    onClick={backspace}
                    disabled={loading}
                  >
                    ⌫
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.tvGateKey}
                  onClick={() => pushDigit(key)}
                  disabled={loading || digits.length >= TV_CODE_LENGTH}
                >
                  {key}
                </button>
              );
            }
          )}
        </div>
      </form>
    </div>
  );
}
