import { useSono } from "../state/store";
import { MESSAGES, type Messages } from "./messages";

export { type Language, MESSAGES, type Messages, type TaskCopy } from "./messages";

/** The words of the current language. */
export function useT(): Messages {
  return MESSAGES[useSono((s) => s.language)];
}
