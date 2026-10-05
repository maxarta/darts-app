"use client";

import { useState } from "react";
import {
  VictoryDartboardHeatmap,
  type RulesHighlightZone,
} from "@/components/game/VictoryDartboardHeatmap";
import styles from "./home.module.css";

const ZONES: Array<{
  key: RulesHighlightZone;
  value: string;
  title: string;
}> = [
  { key: "double", value: "×2", title: "Удвоение" },
  { key: "triple", value: "×3", title: "Утроение" },
  { key: "bull25", value: "25", title: "Полубулл" },
  { key: "bull50", value: "50", title: "Булл" },
];

export function RulesBoard() {
  const [active, setActive] = useState<RulesHighlightZone | null>(null);

  const toggle = (key: RulesHighlightZone) => {
    setActive((prev) => (prev === key ? null : key));
  };

  return (
    <div className={styles.rulesBoard}>
      <div className={styles.rulesCopy}>
        <p>
          <strong>501</strong> и&nbsp;<strong>301</strong>&nbsp;— списать очки
          ровно до&nbsp;нуля. За&nbsp;подход до трёх дротиков. Если на финише
          вышло больше нуля, весь подход сгорает.
        </p>
        <p>
          На&nbsp;мишени есть обычные сектора с&nbsp;очками, кольцо удвоения
          (×2), кольцо утроения (×3), полубулл (25) и&nbsp;булл (50) в&nbsp;центре.
          Нажмите «Показать», чтобы подсветить нужную зону.
        </p>
      </div>

      <div className={styles.rulesVisual}>
        <div className={styles.rulesLegendRow}>
          {ZONES.map((item) => {
            const isOn = active === item.key;
            return (
              <div key={item.key} className={styles.rulesLegendCell}>
                <button
                  type="button"
                  className={[
                    styles.rulesShowBtn,
                    isOn ? styles.rulesShowBtnActive : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={isOn}
                  onClick={() => toggle(item.key)}
                >
                  {isOn ? "Скрыть" : "Показать"}
                </button>
                <p className={styles.rulesLegendValue}>{item.value}</p>
                <p className={styles.rulesLegendTitle}>{item.title}</p>
              </div>
            );
          })}
        </div>

        <div className={styles.rulesStage}>
          <VictoryDartboardHeatmap
            throws={[]}
            tightViewport
            fullColor
            appearance="rules"
            highlightZone={active}
            className={styles.rulesBoardHeat}
          />
        </div>
      </div>

      <div className={[styles.rulesCopy, styles.rulesCopyAfter].join(" ")}>
        <p>
          Классика заканчивается удвоением (осталось&nbsp;4&nbsp;→ двойная&nbsp;2).
          Новичкам проще без удвоения: осталось&nbsp;4&nbsp;→ просто&nbsp;4. Можно
          и&nbsp;с&nbsp;утроением&nbsp;— это выбирается перед игрой.
        </p>
        <p>
          Сверху в&nbsp;интерфейсе: промах, булл и&nbsp;полубулл. Дальше обычные
          очки, ниже удвоения, ещё ниже утроения. Внизу&nbsp;— отмена, если
          ошиблись, и&nbsp;«Следующий игрок». Ранний «Следующий игрок»
          засчитывает оставшиеся дротики как промах.
        </p>
      </div>
    </div>
  );
}
