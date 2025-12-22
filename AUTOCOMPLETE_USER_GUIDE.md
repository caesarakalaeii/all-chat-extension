# 7TV Autocomplete - User Guide

## What's New?

The All-Chat extension now supports **7TV emote autocomplete**! This feature helps you quickly insert emotes without typing the full name.

## How to Use

### Basic Usage

1. **Start typing** an emote name in the chat input box
   ```
   Type: "pog"
   ```

2. **Autocomplete appears** after 2+ characters
   - A dropdown shows below the input
   - Up to 10 matching emotes are displayed
   - Each emote shows:
     * Preview image
     * Emote name
     * Provider badge (7tv)

3. **Select an emote** using:
   - **Keyboard**: 
     * `↑` / `↓` arrows to navigate
     * `Enter` to select highlighted emote
     * `Esc` to close dropdown
   - **Mouse**: 
     * Click any suggestion to select it

4. **Emote is inserted** into your message
   - Full emote name replaces what you typed
   - Space is added after the emote
   - Cursor moves to the right position
   - You can continue typing

### Example Flow

```
User types: "Hello pog"
             ^cursor here, dropdown shows: Pog, Poggers, PogChamp, etc.

User presses ↓ then Enter

Result: "Hello Poggers "
                       ^cursor here, ready to continue typing
```

## Features

### Smart Detection
- Autocomplete only triggers when:
  * You've typed 2+ letters
  * The word starts with a letter (a-z, A-Z)
  * There are matching emotes

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `↑` | Move selection up |
| `↓` | Move selection down |
| `Enter` | Select highlighted emote |
| `Esc` | Close autocomplete |

### Performance
- Emotes are cached for 5 minutes
- Minimal API calls
- Smooth, responsive UI
- No lag or slowdown

## What Emotes Are Available?

The autocomplete shows:
- **Global 7TV emotes** (available everywhere)
- **Channel-specific 7TV emotes** (specific to the streamer)

Currently supports **7TV only**. BTTV and FFZ emotes may be added in future updates.

## Privacy & Security

- ✅ No data is collected or stored permanently
- ✅ Emotes are cached locally for 5 minutes
- ✅ Only connects to official 7TV API
- ✅ Channel names are sanitized before API calls
- ✅ No tracking or analytics

## Troubleshooting

### Autocomplete not showing?
- Make sure you've typed at least 2 letters
- Check that you started with a letter (not a number or symbol)
- Verify emote exists on 7TV
- Wait a moment for emotes to load (first time only)

### Wrong emotes showing?
- Emotes are specific to the channel you're watching
- If emotes are outdated, wait 5 minutes for cache to refresh
- Or reload the page to clear cache

### Can't select emote?
- Try using Enter key instead of clicking
- Make sure dropdown is visible
- Check console for errors (F12 → Console tab)

## Developer Info

### API Used
- 7TV v3 API: `https://7tv.io/v3`
- Global emotes: `/emote-sets/global`
- Channel emotes: `/users/twitch/{channel}`

### Cache Duration
- 5 minutes per channel
- Cleared on page reload
- Independent per streamer

### Bundle Impact
- Added ~4KB to bundle size
- Minimal performance impact
- Lazy-loaded emote images

## Future Enhancements

Possible future improvements (not yet implemented):
- [ ] BTTV emote support
- [ ] FFZ emote support  
- [ ] Fuzzy search (not just prefix)
- [ ] Recent/favorite emotes
- [ ] Tab completion
- [ ] Emote categories
- [ ] Custom emote sets

## Feedback

Found a bug or have a suggestion? 
- Open an issue on GitHub
- Check existing issues first
- Include browser version and steps to reproduce

---

**Enjoy using 7TV emotes with autocomplete!** 🎉
