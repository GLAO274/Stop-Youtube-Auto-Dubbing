// Stop YouTube Auto-Dubbing - v1.1.1
(function() {
  'use strict';

  if (window.__stopYTAutoDubbing) return;
  window.__stopYTAutoDubbing = true;

  console.log('[Stop YouTube Auto-Dubbing] v1.1.1 loaded');

  let isEnabled = true;
  let cookieSet = false;
  let hasClickedOnce = false;
  let lastVideoId = null;

  function init() {
    chrome.storage.sync.get(['enabled'], function(result) {
      isEnabled = result.enabled !== false;
      
      if (isEnabled) {
        setPreferenceCookie();
        setupNavigationListener();
        setupAudioMonitor();
        
        // Auto-click original audio
        setTimeout(autoClickOriginalAudio, 2000);
        
        // Fix metadata
        setTimeout(fixMetadata, 1500);
      }
    });

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      if (request.action === 'toggleEnabled') {
        isEnabled = request.enabled;
        
        if (isEnabled) {
          setPreferenceCookie();
          setTimeout(autoClickOriginalAudio, 1000);
          setTimeout(fixMetadata, 500);
        }
        
        sendResponse({ success: true });
      }
      return true;
    });
  }

  function setPreferenceCookie() {
    if (cookieSet) return;
    cookieSet = true;

    try {
      document.cookie = "PREF=hl=en&gl=US&f6=400; domain=.youtube.com; path=/; max-age=31536000";
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error setting cookie:', e.message);
    }
  }

  function setupNavigationListener() {
    document.addEventListener('yt-navigate-finish', function() {
      if (!isEnabled) return;
      
      hasClickedOnce = false;
      lastVideoId = null;
      setPreferenceCookie();
      
      setTimeout(autoClickOriginalAudio, 2000);
      setTimeout(fixMetadata, 1500);
    });
  }

  function setupAudioMonitor() {
    document.addEventListener('yt-popup-opened', function() {
      if (!isEnabled) return;
      setTimeout(clickOriginalIfNeeded, 100);
    });
  }

  // Get video ID from both /watch and /shorts URLs
  function getVideoId() {
    // For /watch?v=videoID
    const urlParams = new URLSearchParams(location.search);
    const watchId = urlParams.get('v');
    if (watchId) return watchId;
    
    // For /shorts/videoID
    const shortsMatch = location.pathname.match(/\/shorts\/([^/?]+)/);
    if (shortsMatch) return shortsMatch[1];
    
    return null;
  }

  // Fix title and description by fetching original metadata
  async function fixMetadata() {
    const videoId = getVideoId();
    if (!videoId || videoId === lastVideoId) return;
    
    lastVideoId = videoId;

    try {
      // Try to get from ytInitialPlayerResponse first
      if (window.ytInitialPlayerResponse?.videoDetails) {
        const details = window.ytInitialPlayerResponse.videoDetails;
        
        // Check if it looks translated (all ASCII = probably translated)
        const title = details.title;
        const isLikelyTranslated = /^[\x00-\x7F]*$/.test(title);
        
        if (isLikelyTranslated) {
          await fetchOriginalMetadata(videoId);
        } else {
          applyMetadata(title, details.shortDescription);
        }
      } else {
        await fetchOriginalMetadata(videoId);
      }
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error fixing metadata:', e.message);
    }
  }

  // Fetch original metadata from YouTube API
  async function fetchOriginalMetadata(videoId) {
    try {
      // Extract API key from page
      const scriptText = document.documentElement.innerHTML;
      const apiKeyMatch = scriptText.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      
      if (!apiKeyMatch) return;

      const apiKey = apiKeyMatch[1];

      // Fetch with original language context (no translation)
      const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoId,
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20240208.00.00'
            }
          }
        })
      });

      const data = await response.json();
      
      if (data.videoDetails) {
        const title = data.videoDetails.title;
        const description = data.videoDetails.shortDescription;
        
        console.log('[Stop YouTube Auto-Dubbing] ✓ Restored original title');
        applyMetadata(title, description);
      }
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error fetching metadata:', e.message);
    }
  }

  // Apply title and description to DOM
  function applyMetadata(title, description) {
    if (!title) return;

    // Fix title
    const titleSelectors = [
      'h1.ytd-watch-metadata yt-formatted-string',
      'h1.ytd-video-primary-info-renderer yt-formatted-string',
      'yt-formatted-string.ytd-watch-metadata'
    ];

    titleSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el.textContent !== title) {
          el.textContent = title;
        }
      });
    });

    // Fix page title
    if (document.title.endsWith(' - YouTube')) {
      document.title = title + ' - YouTube';
    }

    // Fix description
    if (description) {
      const descSelectors = [
        '#description-inline-expander yt-formatted-string',
        'ytd-text-inline-expander yt-formatted-string',
        '#description yt-formatted-string'
      ];

      descSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.textContent !== description) {
            el.textContent = description;
          }
        });
      });
    }
  }

  // Auto-click settings menu to change audio
  function autoClickOriginalAudio() {
    if (!isEnabled || hasClickedOnce) return;

    try {
      const settingsButton = document.querySelector('.ytp-settings-button');
      if (!settingsButton) return;

      settingsButton.click();

      setTimeout(() => {
        const menuItems = document.querySelectorAll('.ytp-menuitem');
        let foundAudioMenu = false;

        for (const item of menuItems) {
          const label = item.textContent || '';
          
          // Check for "Audio track" in multiple languages
          if (label.toLowerCase().includes('audio track') || 
              label.includes('音轨') ||  // Chinese Simplified
              label.includes('音軌') ||  // Chinese Traditional
              label.includes('音声トラック') ||  // Japanese
              label.includes('오디오')) {  // Korean
            
            foundAudioMenu = true;
            item.click();
            
            setTimeout(() => {
              clickOriginalIfNeeded();
              
              setTimeout(() => {
                const settingsButton = document.querySelector('.ytp-settings-button');
                if (settingsButton) {
                  settingsButton.click();
                }
              }, 300);
            }, 200);
            
            break;
          }
        }

        // If no audio track menu found, close the settings menu
        if (!foundAudioMenu) {
          setTimeout(() => {
            const settingsButton = document.querySelector('.ytp-settings-button');
            if (settingsButton) {
              settingsButton.click();
            }
          }, 100);
        }
      }, 200);

    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error:', e.message);
    }
  }

  function clickOriginalIfNeeded() {
    try {
      const menuItems = document.querySelectorAll('.ytp-menuitem');
      if (menuItems.length === 0) return;

      for (const item of menuItems) {
        const label = item.getAttribute('aria-label') || item.textContent || '';
        const selected = item.classList.contains('ytp-menuitem-selected');

        // Check for original audio - correct translations
        const isOriginal = 
          label.toLowerCase().includes('original') ||
          label.includes('オリジナル') || // Japanese
          label.includes('原文') ||  // Chinese Traditional
          label.includes('原聲') ||  // Chinese Traditional 2
          label.includes('原始') ||  // Chinese Simplified
          label.includes('원본');  // Korean

        if (isOriginal && !selected) {
          console.log('[Stop YouTube Auto-Dubbing] ✓ Switched to original audio');
          item.click();
          hasClickedOnce = true;
          return true;
        }
      }

      return false;
      
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error:', e.message);
      return false;
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();