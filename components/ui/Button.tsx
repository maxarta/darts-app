import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import styles from "./button.module.css";

type ButtonSize = "big" | "medium" | "small";
type ButtonVariant = "primary" | "secondary" | "subtle";

type ButtonBaseProps = {
  children: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  className?: string;
  disabled?: boolean;
};

type ButtonAsButtonProps = ButtonBaseProps &
  Omit<ComponentProps<"button">, keyof ButtonBaseProps | "type"> & {
    href?: undefined;
  };

type ButtonAsLinkProps = ButtonBaseProps & {
  href: string;
} & Omit<ComponentProps<typeof Link>, keyof ButtonBaseProps | "href">;

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  children,
  size = "medium",
  variant = "primary",
  fullWidth,
  className,
  disabled,
  href,
  ...rest
}: ButtonProps) {
  const classes = cn(
    styles.root,
    styles[size],
    styles[variant],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    className
  );

  if (href) {
    if (disabled) {
      return (
        <span className={classes} aria-disabled="true">
          {children}
        </span>
      );
    }
    const linkRest = rest as Omit<ComponentProps<typeof Link>, "href" | "className">;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {children}
      </Link>
    );
  }

  const buttonRest = rest as Omit<ComponentProps<"button">, "className" | "disabled">;
  return (
    <button
      type="button"
      className={classes}
      disabled={disabled}
      {...buttonRest}
    >
      {children}
    </button>
  );
}
