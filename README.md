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

This happens automatically once the player is ready after each video loads.
The menu is kept visually hidden while this runs, and the extension:

- skips the whole procedure if the audio-track menu does not exist (single-track video)
- skips it if the original track is already selected, so undubbed videos are never re-buffered
- never touches the menu while you have it open yourself
- restores keyboard focus to wherever it was

### Title & Description Restoration

The extension **fetches original metadata from YouTube's internal API**, then actively maintains it:

1. **Title & Description**: Fetched from YouTube's internal API for complete, accurate original content (schema.org meta tags are used as a fallback if the API call fails)
2. Replaces translated content in the DOM with original language content
3. **Actively monitors the page** with MutationObserver to prevent YouTube from reverting changes on hover or interaction

This ensures the original title and description stay visible even when YouTube's reactive framework tries to re-apply translations.

## Supported Languages

Audio track detection works with these YouTube interface languages:

- English
- Chinese Simplified (简体中文)
- Chinese Traditional (繁體中文)
- Japanese (日本語)
- Korean (한국어)

This is the language of your **YouTube interface**, not the language of the
video. The video itself can be in any language.

### Adding Your Language

All matching lives in two arrays at the top of `content.js`. Add your
interface language's wording for "Audio track" and for "Original":

```javascript
const AUDIO_TRACK_LABELS = [
  'audio track',      // English
  '音轨',              // Chinese Simplified
  '音軌',              // Chinese Traditional
  '音声トラック',       // Japanese
  '오디오',             // Korean
  'your_translation'  // <- add yours here
];

const ORIGINAL_LABELS = [
  'original',         // English
  '原始',              // Chinese Simplified
  '原声',              // Chinese Simplified
  '原文',              // Chinese Traditional
  '原聲',              // Chinese Traditional
  'オリジナル',         // Japanese
  '원본',               // Korean
  'your_translation'  // <- add yours here
];
```

To find the exact wording, open a video, click the gear icon, and read the row
above "Quality" (that is your "Audio track" text). Open that row and read the
entry marked as the source audio (that is your "Original" text).

Notes:

- Matching is case-insensitive and by substring, so a word stem such as
  `'oryginaln'` covers all its inflected forms.
- Save `content.js` as **UTF-8**, or the non-Latin entries will be corrupted
  and silently stop matching.
- Reload the extension at `chrome://extensions/` and refresh YouTube to test.

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

1.1.5

## Changelog

- **1.1.5**: No longer closes other YouTube popups such as the account menu; No longer re-selects an audio track that is already active, which restarted undubbed videos; Settings menu is hidden while switching; Retries while the player loads instead of giving up; Focus, title selector and PREF cookie fixes
- **1.1.4**: Fixed title not showing when navigating between videos
- **1.1.3**: Fixed audio track switching issue
- **1.1.2**: Fixed dark mode switching bug; Fixed mouse locking issue; Added processing lock to prevent race conditions; Fixed description persistence; Improved metadata fetching; Enhanced reliability with proper event-driven architecture
- **1.1.1**: Complete rewrite; Auto-clicks settings menu to select original audio; Fetches and restores original title/description from YouTube API; Multi-language support (EN, JP, CN, KR)
- **1.0.1**: Better permission handling; Better error handling; Fix the toggle; CSP compliance
- **1.0.0**: Base function

---

**Not affiliated with YouTube or Google**