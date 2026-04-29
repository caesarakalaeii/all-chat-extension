import { test } from '@playwright/test';

test.describe('Tab bar switcher', () => {
  test.skip('WIDGET-01: Tab bar appears in .chat-shell on Twitch pages', async () => {
    // Verify #allchat-tab-bar exists as direct child of .chat-shell
    // Verify it contains two tab buttons: #allchat-tab-allchat and #allchat-tab-twitch
    // Verify role="tablist" and aria-label="Chat view switcher" on container
  });

  test.skip('WIDGET-02: Clicking Twitch Chat tab hides AllChat iframe and shows native chat', async () => {
    // Click #allchat-tab-twitch
    // Verify #allchat-container has display: none
    // Verify #allchat-hide-native-style element is removed from DOM
    // Verify #allchat-tab-twitch has aria-selected="true"
  });

  test.skip('WIDGET-03: Clicking AllChat tab restores AllChat iframe and hides native chat', async () => {
    // Switch to Twitch tab first, then click #allchat-tab-allchat
    // Verify #allchat-container is visible (not display: none)
    // Verify #allchat-hide-native-style is present in head
    // Verify #allchat-tab-allchat has aria-selected="true"
  });

  test.skip('WIDGET-04: Tab bar persists when native chat tab is active', async () => {
    // Click #allchat-tab-twitch to switch to native
    // Verify #allchat-tab-bar is still visible (not display: none)
    // Verify tab bar z-index places it above native chat
  });
});
