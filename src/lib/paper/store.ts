import type { PaperPortfolio } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __paperAccounts__: Record<string, PaperPortfolio> | undefined;
}

export const paperStore: Record<string, PaperPortfolio> =
  global.__paperAccounts__ ?? {};

if (!global.__paperAccounts__) {
  global.__paperAccounts__ = paperStore;
}

export function getPortfolio(accountId: string) {
  return paperStore[accountId];
}

export function savePortfolio(portfolio: PaperPortfolio) {
  paperStore[portfolio.account.accountId] = portfolio;
}
