import posthog from "posthog-js";

type Props = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, props?: Props) {
  if (typeof window === "undefined") return;
  posthog.capture(event, props);
}
