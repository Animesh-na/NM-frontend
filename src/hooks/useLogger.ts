import { useMemo } from "react";
import { logger } from "@/services/logger";

/** Convenience hook that pre-binds a `component` tag onto every call. */
export function useLogger(component: string) {
  return useMemo(() => ({
    debug: (m: string, meta?: Record<string, unknown>) => logger.debug(m, { ...meta, component }),
    info:  (m: string, meta?: Record<string, unknown>) => logger.info(m,  { ...meta, component }),
    warn:  (m: string, meta?: Record<string, unknown>) => logger.warn(m,  { ...meta, component }),
    error: (m: string, meta?: Record<string, unknown>) => logger.error(m, { ...meta, component }),
    fatal: (m: string, meta?: Record<string, unknown>) => logger.fatal(m, { ...meta, component }),
  }), [component]);
}