// Stop YouTube Auto-Dubbing - v1.1.2
(function() {
  'use strict';

  if (window.__stopYTAutoDubbing) return;
  window.__stopYTAutoDubbing = true;

  console.log('[Stop YouTube Auto-Dubbing] v1.1.2 loaded');

  let isEnabled = true;
  let cookieSet = false;
  let hasClickedOnce = false;
  let lastVideoId = null;
  let isProcessing = false; // Prevent overlapping operations

  function init() {
    chrome.storage.sync.get(['enabled'], function(result) {
      isEnabled = result.enabled !== false;
      
      if (isEnabled) {
        setPreferenceCookie();
        setupNavigationListener();
        setupAudioMonitor();
        
        setTimeout(autoClickOriginalAudio, 2000);
        waitForPlayerResponse();
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
      const currentCookie = document.cookie
        .split('; ')
        .find(row => row.startsWith('PREF='));
      
      let prefValue = 'f6=400';
      
      if (currentCookie) {
        const existingPrefs = currentCookie.substring(5);
        const prefParts = existingPrefs.split('&');
        const preservedParts = prefParts.filter(part => 
          !part.startsWith('f6=') &&
          !part.startsWith('hl=') &&
          !part.startsWith('gl=')
        );
        
        if (preservedParts.length > 0) {
          prefValue = preservedParts.join('&') + '&f6=400';
        }
      }
      
      document.cookie = `PREF=${prefValue}; domain=.youtube.com; path=/; max-age=31536000`;
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error setting cookie:', e.message);
    }
  }

  function setupNavigationListener() {
    document.addEventListener('yt-navigate-finish', function() {
      if (!isEnabled) return;
      
      hasClickedOnce = false;
      lastVideoId = null;
      originalDescription = null;
      originalTitle = null;
      
      if (descriptionObserver) {
        descriptionObserver.disconnect();
        descriptionObserver = null;
      }
      
      setPreferenceCookie();
      
      setTimeout(autoClickOriginalAudio, 2000);
      
      waitForPlayerResponse();
    });
  }

  function waitForPlayerResponse(attempts = 0) {
    const maxAttempts = 6; // 6 attempts * 500ms = 3 seconds max
    
    if (attempts >= maxAttempts) {
      fixMetadata();
      return;
    }
    
    // Check if schema.org meta tags exist
    const hasSchema = document.querySelector('meta[itemprop="name"]');
    
    if (hasSchema) {
      fixMetadata();
    } else {
      setTimeout(() => waitForPlayerResponse(attempts + 1), 500);
    }
  }

  function setupAudioMonitor() {
    document.addEventListener('yt-popup-opened', function() {
      if (!isEnabled || isProcessing) return; 
      setTimeout(clickOriginalIfNeeded, 100);
    });
  }

  function getVideoId() {
    const urlParams = new URLSearchParams(location.search);
    const watchId = urlParams.get('v');
    if (watchId) return watchId;
    
    const shortsMatch = location.pathname.match(/\/shorts\/([^/?]+)/);
    if (shortsMatch) return shortsMatch[1];
    
    return null;
  }

  // Extract original metadata from schema.org meta tags (fallback)
  function getSchemaMetadata() {
    try {
      const titleMeta = document.querySelector('meta[itemprop="name"]');
      const descMeta = document.querySelector('meta[itemprop="description"]');
      
      if (titleMeta || descMeta) {
        return {
          title: titleMeta?.content || null,
          description: descMeta?.content || null
        };
      }
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error reading schema.org:', e.message);
    }
    return null;
  }

  async function fixMetadata() {
    const videoId = getVideoId();
    
    if (!videoId || videoId === lastVideoId) return;
    
    lastVideoId = videoId;

    try {
      // Get title from schema.org (fast and complete)
      const schemaData = getSchemaMetadata();
      const schemaTitle = schemaData?.title;
      
      if (schemaTitle) {
        // Apply title immediately
        applyMetadata(schemaTitle, null);
        
        // Update ytInitialPlayerResponse if it exists
        if (window.ytInitialPlayerResponse?.videoDetails) {
          window.ytInitialPlayerResponse.videoDetails.title = schemaTitle;
        }
      }
      
      // Always fetch description from API (schema.org description is truncated)
      const original = await fetchOriginalMetadata(videoId);
      
      if (original) {
        // Update ytInitialPlayerResponse if it exists
        if (window.ytInitialPlayerResponse?.videoDetails) {
          window.ytInitialPlayerResponse.videoDetails.title = original.title;
          window.ytInitialPlayerResponse.videoDetails.shortDescription = original.description;
        }
        
        applyMetadata(original.title, original.description);
        console.log('[Stop YouTube Auto-Dubbing] ✓ Restored original metadata');
      } else if (schemaTitle) {
        // If API fetch fails but we have schema title, use that
        applyMetadata(schemaTitle, null);
      }
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error fixing metadata:', e.message);
    }
  }

  async function fetchOriginalMetadata(videoId) {
    try {
      const scriptText = document.documentElement.innerHTML;
      const apiKeyMatch = scriptText.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      
      if (!apiKeyMatch) return null;

      const apiKey = apiKeyMatch[1];

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
        return {
          title: data.videoDetails.title,
          description: data.videoDetails.shortDescription
        };
      }
      
      return null;
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error fetching metadata:', e.message);
      return null;
    }
  }

  let originalDescription = null;
  let originalTitle = null;

  // ORIGINAL WORKING CODE with SAFE description fix
  function applyMetadata(title, description) {
    if (!title) return;

    // Store originals for observer
    if (title) originalTitle = title;
    if (description) originalDescription = description;

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

    if (document.title.endsWith(' - YouTube')) {
      document.title = title + ' - YouTube';
    }

    // Fix description (BOTH collapsed snippet AND expanded full text)
    if (description) {
      updateDescriptionText(description);
    }
    
    // Start watching for YouTube re-rendering the description
    startDescriptionObserver();
  }

  function updateDescriptionText(description) {
    // Fix collapsed snippet 
    const snippetText = document.querySelector('#description-inline-expander #attributed-snippet-text .yt-core-attributed-string');
    if (snippetText && snippetText.textContent !== description.substring(0, 150)) {
      const shortDesc = description.length > 150 ? description.substring(0, 150) : description;
      snippetText.textContent = shortDesc;
    }

    // Fix expanded description 
    const expandedText = document.querySelector('#description-inline-expander #expanded yt-attributed-string .yt-core-attributed-string');
    if (expandedText && expandedText.textContent !== description) {
      expandedText.textContent = description;
    }
  }

  let descriptionObserver = null;

  function startDescriptionObserver() {
    // Stop existing observer
    if (descriptionObserver) {
      descriptionObserver.disconnect();
    }

    if (!originalDescription) return;

    const descContainer = document.querySelector('#description-inline-expander');
    if (!descContainer) return;

    descriptionObserver = new MutationObserver(() => {
      if (originalDescription) {
        updateDescriptionText(originalDescription);
      }
    });

    descriptionObserver.observe(descContainer, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // Auto-click settings menu to change audio
  function autoClickOriginalAudio() {
    if (!isEnabled || hasClickedOnce || isProcessing) return;
    
    isProcessing = true; // Set processing flag

    try {
      const settingsButton = document.querySelector('.ytp-settings-button');
      if (!settingsButton) {
        isProcessing = false;
        return;
      }

      // Check if menu is already open
      const existingPanel = document.querySelector('.ytp-panel-menu');
      if (existingPanel && existingPanel.style.display !== 'none') {
        processAudioMenu();
        return;
      }

      settingsButton.click();

      setTimeout(() => {
        const menuItems = document.querySelectorAll('.ytp-menuitem');
        let foundAudioMenu = false;

        for (const item of menuItems) {
          const label = item.textContent || '';
          
          if (label.toLowerCase().includes('audio track') || 
              label.includes('音轨') || // Chinese Simplified
              label.includes('音軌') || // Chinese Traditional
              label.includes('音声トラック') || // Japanese
              label.includes('오디오')) {  // Korean
            
            foundAudioMenu = true;
            item.click();
            
            setTimeout(() => {
              clickOriginalIfNeeded();
              
              // Always close menu to prevent mouse lock
              setTimeout(() => {
                closeSettingsMenu();
                isProcessing = false;
              }, 300);
            }, 200);
            
            break;
          }
        }

        if (!foundAudioMenu) {
          closeSettingsMenu();
          isProcessing = false;
        }
      }, 200);

    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error:', e.message);
      closeSettingsMenu();
      isProcessing = false;
    }
  }

  // Helper function for when menu is already open
  function processAudioMenu() {
    setTimeout(() => {
      clickOriginalIfNeeded();
      setTimeout(() => {
        closeSettingsMenu();
        isProcessing = false;
      }, 300);
    }, 200);
  }

  // Improved menu closing with fallback
  function closeSettingsMenu() {
    try {
      const settingsButton = document.querySelector('.ytp-settings-button');
      if (settingsButton) {
        const panel = document.querySelector('.ytp-panel-menu');
        if (panel && panel.style.display !== 'none') {
          settingsButton.click();
        }
      }
      
      // Fallback: click outside menu
      setTimeout(() => {
        const panel = document.querySelector('.ytp-panel-menu');
        if (panel && panel.style.display !== 'none') {
          const player = document.querySelector('.html5-video-player');
          if (player) {
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            player.dispatchEvent(clickEvent);
          }
        }
      }, 100);
      
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error closing menu:', e.message);
    }
  }

  function clickOriginalIfNeeded() {
    try {
      const menuItems = document.querySelectorAll('.ytp-menuitem');
      if (menuItems.length === 0) return;

      for (const item of menuItems) {
        const label = item.getAttribute('aria-label') || item.textContent || '';
        const selected = item.classList.contains('ytp-menuitem-selected');

        const isOriginal = 
          label.toLowerCase().includes('original') ||
          label.includes('オリジナル') || // Japanese
          label.includes('原文') ||  // Chinese Traditional
          label.includes('原声') ||  // Chinese Traditional 2
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();