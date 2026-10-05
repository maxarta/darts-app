import {
  Link as RouterLink,
  type LinkProps as RouterLinkProps,
} from "react-router-dom";
import type { ReactNode, MouseEventHandler, CSSProperties } from "react";

type LinkProps = {
  href: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  replace?: boolean;
  prefetch?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  target?: string;
  rel?: string;
  "aria-label"?: string;
  id?: string;
} & Omit<RouterLinkProps, "to">;

export default function Link({
  href,
  children,
  replace,
  prefetch: _prefetch,
  scroll: _scroll,
  shallow: _shallow,
  passHref: _passHref,
  legacyBehavior: _legacyBehavior,
  ...rest
}: LinkProps) {
  return (
    <RouterLink to={href} replace={replace} {...rest}>
      {children}
    </RouterLink>
  );
}
