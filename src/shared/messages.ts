/**
 * Typed message helpers for chrome.runtime.sendMessage.
 * Mirrors the MessageType discriminated union in types.ts.
 */

import type { MessageType } from './types';

export function sendToContentScript(
  tabId: number,
  message: MessageType,
): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message);
}

export function sendToBackground(message: MessageType): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}
