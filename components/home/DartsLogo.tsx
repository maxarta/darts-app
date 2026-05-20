import Image from "next/image";
import styles from "./home.module.css";

const LOGO_WIDTH = 107;
const LOGO_HEIGHT = 17;

export function DartsLogo() {
  return (
    <div className={styles.logo} aria-label="DARTS">
      <Image
        src="/logo.svg"
        alt=""
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className={styles.logoImage}
        priority
      />
    </div>
  );
}
