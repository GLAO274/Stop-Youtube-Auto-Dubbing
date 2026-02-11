# Stop YouTube Auto-Dubbing

A Chrome/Firefox extension that prevents YouTube from auto-dubbing videos and auto-translating titles and descriptions.

![Showcase](https://github.com/GLAO274/Stop-Youtube-Auto-Dubbing/blob/main/showcase.jpg?raw=true)

## Features

- Prevents Auto-Dubbing
- Shows Original Titles
- Shows Original Descriptions

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

The extension:
- Monitors video player for dubbed audio tracks
- Switches to original/first audio track automatically
- Fetches original metadata from YouTube's internal APIs
- Replaces translated titles/descriptions with originals
- Removes translation URL parameters

## File Structure

```
stop-youtube-auto-dubbing/
├── manifest.json    # Extension config
├── content.js       # Main script (runs on YouTube)
├── popup.html       # UI popup (with inline CSS/JS)
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
1.0.1

## Changelog
- **1.0.1**: Better permission handling; Better error handling; Fix the toggle
- **1.0.0**: Base function

---

**Not affiliated with YouTube or Google**
