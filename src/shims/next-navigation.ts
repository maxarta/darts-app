import {
  useNavigate,
  useLocation,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";
import { useMemo } from "react";

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href: string, _options?: { scroll?: boolean }) => {
        void navigate(href);
      },
      replace: (href: string, _options?: { scroll?: boolean }) => {
        void navigate(href, { replace: true });
      },
      back: () => {
        void navigate(-1);
      },
      forward: () => {
        void navigate(1);
      },
      prefetch: async (_href: string) => {},
      refresh: () => {
        void navigate(0);
      },
    }),
    [navigate]
  );
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const [params] = useRouterSearchParams();
  return params;
}

export function useParams<
  T extends Record<string, string | string[]> = Record<string, string>,
>(): T {
  return useRouterParams() as T;
}

export function redirect(url: string): never {
  throw new Error(`redirect(${url}) is not supported in the Vite SPA`);
}

export function notFound(): never {
  throw new Error("notFound() is not supported in the Vite SPA");
}
