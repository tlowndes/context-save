/** "6 DAYS", "1 DAY": how long someone has been waiting. */
export const waitingLabel = (days: number): string => `${days} ${days === 1 ? "DAY" : "DAYS"}`;
