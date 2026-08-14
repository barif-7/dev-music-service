export default function LiveAnnouncer({ enabled, message, politeness = "polite" }) {
  if (!enabled) return null;
  return <div aria-live={politeness} aria-atomic="true" role="status" className="sr-only">{message}</div>;
}
