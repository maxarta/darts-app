export type IdMatch = { id: string };

/** Preserve round-robin card order across poll refreshes. */
export function stableRoundRobinOrder<T extends IdMatch>(
  matches: T[],
  orderRef: { current: string[] }
): T[] {
  if (matches.length === 0) {
    orderRef.current = [];
    return matches;
  }

  const byId = new Map(matches.map((m) => [m.id, m]));

  if (orderRef.current.length === 0) {
    orderRef.current = matches.map((m) => m.id);
  } else {
    for (const m of matches) {
      if (!orderRef.current.includes(m.id)) {
        orderRef.current.push(m.id);
      }
    }
    orderRef.current = orderRef.current.filter((id) => byId.has(id));
  }

  return orderRef.current
    .map((id) => byId.get(id))
    .filter((m): m is T => m != null);
}
