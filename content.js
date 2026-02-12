// Stop YouTube Auto-Dubbing - v1.1.3
(function() {
  'use strict';

  if (window.__stopYTAutoDubbing) return;
  window.__stopYTAutoDubbing = true;

  let isEnabled = true;
  let cookieSet = false;
  let hasClickedOnce = false;
  let lastVideoId = null;
  let isProcessing = false;

  function init() {
    chrome.storage.sync.get(['enabled'], function(result) {
      isEnabled = result.enabled !== false;
      
      if (isEnabled) {
        setPreferenceCookie();
        setupNavigationListener();
        setupAudioMonitor();
        
        setTimeout(autoClickOriginalAudio, 3000);
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
      isProcessing = false;
      
      if (descriptionObserver) {
        descriptionObserver.disconnect();
        descriptionObserver = null;
      }
      
      setPreferenceCookie();
      
      setTimeout(autoClickOriginalAudio, 3000);
      
      waitForPlayerResponse();
    });
  }

  function waitForPlayerResponse(attempts = 0) {
    const maxAttempts = 6;
    
    if (attempts >= maxAttempts) {
      fixMetadata();
      return;
    }
    
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
      const schemaData = getSchemaMetadata();
      const schemaTitle = schemaData?.title;
      
      if (schemaTitle) {
        applyMetadata(schemaTitle, null);
        
        if (window.ytInitialPlayerResponse?.videoDetails) {
          window.ytInitialPlayerResponse.videoDetails.title = schemaTitle;
        }
      }
      
      const original = await fetchOriginalMetadata(videoId);
      
      if (original) {
        if (window.ytInitialPlayerResponse?.videoDetails) {
          window.ytInitialPlayerResponse.videoDetails.title = original.title;
          window.ytInitialPlayerResponse.videoDetails.shortDescription = original.description;
        }
        
        applyMetadata(original.title, original.description);
        console.log('[Stop YouTube Auto-Dubbing] ✓ Restored original metadata');
      } else if (schemaTitle) {
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

  function applyMetadata(title, description) {
    if (!title) return;

    if (title) originalTitle = title;
    if (description) originalDescription = description;

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

    if (description) {
      updateDescriptionText(description);
    }
    
    startDescriptionObserver();
  }

  function updateDescriptionText(description) {
    const snippetText = document.querySelector('#description-inline-expander #attributed-snippet-text .yt-core-attributed-string');
    if (snippetText && snippetText.textContent !== description.substring(0, 150)) {
      const shortDesc = description.length > 150 ? description.substring(0, 150) : description;
      snippetText.textContent = shortDesc;
    }

    const expandedText = document.querySelector('#description-inline-expander #expanded yt-attributed-string .yt-core-attributed-string');
    if (expandedText && expandedText.textContent !== description) {
      expandedText.textContent = description;
    }
  }

  let descriptionObserver = null;

  function startDescriptionObserver() {
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

  function autoClickOriginalAudio() {
    if (!isEnabled || hasClickedOnce || isProcessing) return;
    
    isProcessing = true;

    try {
      const settingsButton = document.querySelector('.ytp-settings-button');
      if (!settingsButton) {
        isProcessing = false;
        hasClickedOnce = true;
        return;
      }

      settingsButton.click();

      setTimeout(() => {
        const menuItems = document.querySelectorAll('.ytp-menuitem');
        let foundAudioMenu = false;

        for (const item of menuItems) {
          const label = item.textContent || '';
          
          if (label.toLowerCase().includes('audio track') || 
              label.includes('音轨') ||
              label.includes('音軌') ||
              label.includes('音声トラック') ||
              label.includes('오디오')) {
            
            foundAudioMenu = true;
            item.click();
            
            setTimeout(() => {
              clickOriginalIfNeeded();
              
              setTimeout(() => {
                closeSettingsMenu();
                isProcessing = false;
                hasClickedOnce = true;
              }, 400);
            }, 400);
            
            break;
          }
        }

        if (!foundAudioMenu) {
          closeSettingsMenu();
          isProcessing = false;
          hasClickedOnce = true;
        }
      }, 800);

    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Error:', e.message);
      closeSettingsMenu();
      isProcessing = false;
      hasClickedOnce = true;
    }
  }

  function closeSettingsMenu() {
    try {
      const settingsButton = document.querySelector('.ytp-settings-button');
      if (settingsButton) {
        const panel = document.querySelector('.ytp-panel-menu');
        if (panel && panel.style.display !== 'none') {
          settingsButton.click();
        }
      }
    } catch (e) {
      // Silent fail
    }
  }

  function clickOriginalIfNeeded() {
    try {
      const menuItems = document.querySelectorAll('.ytp-menuitem');
      if (menuItems.length === 0) return false;

      for (const item of menuItems) {
        const label = item.getAttribute('aria-label') || item.textContent || '';
        const selected = item.classList.contains('ytp-menuitem-selected');

        const isOriginal = 
          label.toLowerCase().includes('original') ||
          label.includes('オリジナル') ||
          label.includes('原文') ||
          label.includes('原声') ||
          label.includes('原始') ||
          label.includes('원본');

        if (isOriginal && !selected) {
          console.log('[Stop YouTube Auto-Dubbing] ✓ Switched to original audio');
          item.click();
          return true;
        }
      }

      return false;
      
    } catch (e) {
      return false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();