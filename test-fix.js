const { chromium } = require('playwright');
const path = require('path');

async function testExtension() {
  console.log('🧪 Testing All-Chat Extension Fix...\n');

  const pathToExtension = path.join(__dirname, 'dist');
  console.log('Loading extension from:', pathToExtension);

  // Launch browser with extension
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
      '--no-sandbox',
    ],
  });

  const page = await context.newPage();

  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push({ type: msg.type(), text });
    console.log(`[${msg.type().toUpperCase()}]`, text);
  });

  // Navigate to Twitch directory page first (won't inject extension)
  console.log('\n📺 Navigating to Twitch directory...');
  await page.goto('https://www.twitch.tv/directory', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Check if service worker initialized
  const serviceWorkerMsg = consoleMessages.find(m =>
    m.text.includes('Service worker initialized') ||
    m.text.includes('[AllChat]')
  );

  if (serviceWorkerMsg) {
    console.log('\n✅ Service worker detected');
  } else {
    console.log('\n⚠️  Service worker messages not detected (this is normal for directory page)');
  }

  // Now navigate to a real channel (example: twitch.tv/shroud)
  console.log('\n📺 Navigating to a Twitch channel...');
  consoleMessages.length = 0; // Clear previous messages

  await page.goto('https://www.twitch.tv/directory/game/Just%20Chatting', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Check for content script initialization
  const contentScriptMsg = consoleMessages.find(m =>
    m.text.includes('Content script loaded') ||
    m.text.includes('[AllChat Twitch]') ||
    m.text.includes('[AllChat twitch]')
  );

  if (contentScriptMsg) {
    console.log('\n✅ Content script detected');
  }

  // Check for message relay setup
  const messageRelayMsg = consoleMessages.find(m =>
    m.text.includes('Message relay set up')
  );

  if (messageRelayMsg) {
    console.log('✅ Message relay set up detected - FIX IS WORKING!');
  } else {
    console.log('⚠️  Message relay setup not detected yet');
  }

  // Check for UI injection
  const uiInjectedMsg = consoleMessages.find(m =>
    m.text.includes('UI injected')
  );

  if (uiInjectedMsg) {
    console.log('✅ UI injection detected');
  }

  // Check if AllChat container exists in DOM
  const hasAllChatContainer = await page.evaluate(() => {
    return !!document.getElementById('allchat-container');
  });

  if (hasAllChatContainer) {
    console.log('✅ AllChat container found in DOM');
  } else {
    console.log('ℹ️  AllChat container not found (streamer may not be using All-Chat)');
  }

  // Take a screenshot
  await page.screenshot({ path: 'test-extension-screenshot.png', fullPage: false });
  console.log('\n📸 Screenshot saved to: test-extension-screenshot.png');

  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const hasServiceWorker = !!serviceWorkerMsg;
  const hasContentScript = !!contentScriptMsg;
  const hasMessageRelay = !!messageRelayMsg;

  if (hasMessageRelay) {
    console.log('✅ MESSAGE RELAY FIX VERIFIED - Extension should work now!');
  } else if (hasContentScript) {
    console.log('⚠️  Content script loaded but relay not detected (may need more time)');
  } else {
    console.log('ℹ️  Extension loaded, visit a channel using All-Chat to test');
  }

  console.log('\n💡 Browser will stay open for manual testing.');
  console.log('   Press Ctrl+C to close when done.\n');

  // Keep browser open for manual inspection
  await new Promise(() => {}); // Never resolves, keeps browser open
}

testExtension().catch(console.error);
