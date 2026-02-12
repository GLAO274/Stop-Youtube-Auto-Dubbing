# Stop YouTube Auto-Dubbing

A Chrome/Firefox extension that prevents YouTube from auto-dubbing videos and auto-translating titles and descriptions.

![Showcase](https://github.com/GLAO274/Stop-Youtube-Auto-Dubbing/blob/main/showcase.jpg?raw=true)

## Features

- Prevents Auto-Dubbing
- Shows Original Titles
- Shows Original Descriptions
- Works on both regular videos and YouTube Shorts

## Installation

### Chrome/Edge

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the extension folder

### Firefox

**Note:** Requires Firefox 109 or newer for Manifest V3 support.

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` from the extension folder

## How It Works

### Audio Track Switching

The extension **automatically opens the YouTube settings menu** and clicks through to select the original audio track:

1. Opens the settings menu (gear icon)
2. Finds and clicks "Audio track" option
3. Selects the original audio (not auto-dubbed)
4. Closes the menu automatically

This happens automatically 3 seconds after each video loads.

### Title & Description Restoration

The extension **fetches original metadata from YouTube's internal API**, then actively maintains it:

1. **Title & Description**: Fetched from YouTube's internal API for complete, accurate original content
2. Replaces translated content in the DOM with original language content
3. **Actively monitors the page** with MutationObserver to prevent YouTube from reverting changes on hover or interaction

This ensures the original title and description stay visible even when YouTube's reactive framework tries to re-apply translations.

## Supported Languages

The extension currently supports audio track detection in:
- English
- Japanese (日本語)
- Chinese Simplified (简体中文)
- Chinese Traditional (繁體中文)
- Korean (한국어)

### Adding Your Language

If your YouTube interface is in a different language, you need to add translations in **TWO places** in `content.js`:

**Place 1: "Audio track" menu detection**

Find this section:
```javascript
if (label.toLowerCase().includes('audio track') || 
    label.includes('音轨') ||  // Chinese Simplified
    label.includes('音軌') ||  // Chinese Traditional
    label.includes('音声トラック') ||  // Japanese
    label.includes('오디오')) {  // Korean
```

Add a new line with your language's translation of "Audio track", for example:
```javascript
    label.includes('votre_traduction')) {  // Your Language
```

**Place 2: "Original" audio detection**

Find this section:
```javascript
const isOriginal = 
  label.toLowerCase().includes('original') ||
  label.includes('オリジナル') || // Japanese
  label.includes('原文') ||  // Chinese Traditional
  label.includes('原声') ||  // Chinese Traditional 2
  label.includes('原始') ||  // Chinese Simplified
  label.includes('원본');  // Korean
```

Add a new line with your language's translation of "original", for example:
```javascript
  label.includes('votre_traduction');  // Your Language
```

After adding your language, reload the extension and test!

## File Structure

```
stop-youtube-auto-dubbing/
├── manifest.json    # Extension config
├── content.js       # Main script (auto-clicks menus, fetches metadata)
├── popup.html       # UI popup structure
├── popup.js         # Popup logic
├── popup.css        # Popup styles
├── icon128.png      # Extension icon
└── README.md        # This file
```

## Privacy

- No data collection
- No external servers
- Everything runs locally
- Only active on YouTube

## Troubleshooting

**Not working?**
- Ensure extension is enabled (check popup)
- Refresh YouTube page
- Check browser console (F12) for errors

**Still seeing translations?**
- Clear YouTube cookies
- Check YouTube account language settings
- Disable other translation extensions

## Version

1.1.4

## Changelog

- **1.1.4**: Fixed title not showing when navigating between videos
- **1.1.3**: Fixed audio track switching issue
- **1.1.2**: Fixed dark mode switching bug; Fixed mouse locking issue; Added processing lock to prevent race conditions; Fixed description persistence; Improved metadata fetching; Enhanced reliability with proper event-driven architecture
- **1.1.1**: Complete rewrite; Auto-clicks settings menu to select original audio; Fetches and restores original title/description from YouTube API; Multi-language support (EN, JP, CN, KR)
- **1.0.1**: Better permission handling; Better error handling; Fix the toggle; CSP compliance
- **1.0.0**: Base function

---

**Not affiliated with YouTube or Google**