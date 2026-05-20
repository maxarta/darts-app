import Image from "next/image";
import styles from "./tournament.module.css";

/** Блок «Главный приз» из Figma (baskr 6793:1057) */
export function KennyGrandPrizeBanner() {
  return (
    <div className={styles.kennyPrizeBanner} aria-label="Главный приз">
      <div className={styles.kennyPrizeHeader}>
        <p className={styles.kennyPrizeHeaderText}>Главный приз</p>
      </div>
      <div className={styles.kennyPrizeBody}>
        <p className={styles.kennyPrizeSubtitle}>Сертификат Кенни паба</p>
        <Image
          src="/tournament/kenny-prize-3000.svg"
          alt="3000 ₽"
          width={179}
          height={35}
          className={styles.kennyPrizeAmount}
        />
      </div>
    </div>
  );
}
