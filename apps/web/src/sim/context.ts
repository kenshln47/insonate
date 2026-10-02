import { createContext, useContext } from "react";
import type { SonoController } from "./controller";

export const ControllerContext = createContext<SonoController | null>(null);

export function useController(): SonoController {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error("useController must be used inside <ControllerContext.Provider>");
  return controller;
}
