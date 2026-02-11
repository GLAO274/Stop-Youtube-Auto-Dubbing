// Prevents auto-dubbing and restores original titles/descriptions

(function() {
  'use strict';

  console.log('[Stop YouTube Auto-Dubbing] Extension loaded');

  // Configuration
  let isEnabled = true;
  let originalData = {};
  let isInitialized = false;

  // Load settings from storage
  chrome.storage.sync.get(['enabled'], function(result) {
    isEnabled = result.enabled !== false;
    console.log('[Stop YouTube Auto-Dubbing] Extension enabled:', isEnabled);
    if (isEnabled && !isInitialized) {
      isInitialized = true;
      init();
    }
  });

  function init() {
    // Monitor for auto-dubbing and disable it
    monitorAudioTracks();
    
    // Restore original titles and descriptions
    restoreOriginalMetadata();
    
    // Watch for page navigation
    observePageChanges();
  }

  // Prevent auto-dubbing by selecting original audio track
  function monitorAudioTracks() {
    const checkAudioTrack = () => {
      if (!isEnabled) return;

      const video = document.querySelector('video');
      if (!video) return;

      try {
        // Check if there are multiple audio tracks using the audioTracks API
        if (video.audioTracks && video.audioTracks.length > 1) {
          console.log('[Stop YouTube Auto-Dubbing] Found', video.audioTracks.length, 'audio tracks');
          
          // Find and enable the original track
          // The first track is usually the original
          for (let i = 0; i < video.audioTracks.length; i++) {
            const track = video.audioTracks[i];
            
            // Enable the first track (original)
            if (i === 0) {
              if (!track.enabled) {
                console.log('[Stop YouTube Auto-Dubbing] Enabling original track:', track.label || 'Track 0');
                track.enabled = true;
              }
            } else {
              // Disable other tracks
              if (track.enabled) {
                console.log('[Stop YouTube Auto-Dubbing] Disabling dubbed track:', track.label || `Track ${i}`);
                track.enabled = false;
              }
            }
          }
        }
      } catch (e) {
        // Silent fail - API might not be available
      }
    };

    // Check periodically
    setInterval(checkAudioTrack, 2000);
    
    // Check immediately after a delay
    setTimeout(checkAudioTrack, 1000);
    setTimeout(checkAudioTrack, 3000);
  }

  // Function to fetch and restore original metadata
  function restoreOriginalMetadata() {
    if (!isEnabled) return;

    const videoId = getVideoId();
    if (!videoId) return;

    // Check if we already have original data
    if (originalData[videoId]) {
      applyOriginalMetadata(originalData[videoId]);
      return;
    }

    // Fetch original metadata
    fetchOriginalMetadata(videoId);
  }

  // Get current video ID
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // Fetch original metadata from YouTube's page data
  function fetchOriginalMetadata(videoId) {
    try {
      // YouTube stores initial data in ytInitialData
      if (typeof window.ytInitialData !== 'undefined') {
        const data = window.ytInitialData;
        const videoData = findVideoData(data);
        
        if (videoData && videoData.title) {
          const original = {
            title: videoData.title,
            description: videoData.description,
            videoId: videoId
          };
          
          originalData[videoId] = original;
          applyOriginalMetadata(original);
          console.log('[Stop YouTube Auto-Dubbing] Found metadata in ytInitialData');
          return;
        }
      }

      // Try ytInitialPlayerResponse
      if (typeof window.ytInitialPlayerResponse !== 'undefined') {
        const playerData = window.ytInitialPlayerResponse;
        if (playerData.videoDetails) {
          const original = {
            title: playerData.videoDetails.title,
            description: playerData.videoDetails.shortDescription,
            videoId: videoId
          };
          
          originalData[videoId] = original;
          applyOriginalMetadata(original);
          console.log('[Stop YouTube Auto-Dubbing] Found metadata in ytInitialPlayerResponse');
          return;
        }
      }
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Could not fetch original metadata:', e.message);
    }

    // Try to remove translation parameters from URLs
    removeTranslationParameters();
  }

  // Find video data in YouTube's data structure
  function findVideoData(data) {
    try {
      // Try to find in various possible locations
      if (data.contents?.twoColumnWatchNextResults?.results?.results?.contents) {
        const contents = data.contents.twoColumnWatchNextResults.results.results.contents;
        for (const item of contents) {
          if (item.videoPrimaryInfoRenderer) {
            return {
              title: item.videoPrimaryInfoRenderer.title?.runs?.[0]?.text,
              description: item.videoPrimaryInfoRenderer.videoActions
            };
          }
        }
      }
    } catch (e) {
      // Data structure might be different
    }
    return null;
  }

  // Apply original metadata to the page
  function applyOriginalMetadata(data) {
    if (!data) return;

    // Replace title
    if (data.title) {
      // Main title in theater mode and default mode
      const titleElements = document.querySelectorAll(
        'h1.ytd-watch-metadata yt-formatted-string, ' +
        'h1.ytd-video-primary-info-renderer yt-formatted-string, ' +
        'yt-formatted-string.ytd-watch-metadata'
      );
      
      titleElements.forEach(el => {
        if (el.textContent !== data.title) {
          console.log('[Stop YouTube Auto-Dubbing] Restoring original title');
          el.textContent = data.title;
        }
      });

      // Page title
      if (document.title !== data.title) {
        const titleSuffix = ' - YouTube';
        if (document.title.endsWith(titleSuffix)) {
          document.title = data.title + titleSuffix;
        }
      }
    }

    // Replace description
    if (data.description) {
      const descElements = document.querySelectorAll(
        'ytd-text-inline-expander #description-inline-expander yt-formatted-string, ' +
        'ytd-video-secondary-info-renderer #description yt-formatted-string'
      );
      
      descElements.forEach(el => {
        if (el.textContent !== data.description) {
          console.log('[Stop YouTube Auto-Dubbing] Restoring original description');
          el.textContent = data.description;
        }
      });
    }
  }

  // Remove translation parameters from URLs and force original language
  function removeTranslationParameters() {
    // Check current URL
    const url = new URL(window.location.href);
    let modified = false;

    // Remove translation-related parameters
    const paramsToRemove = ['hl', 'gl', 'persist_hl', 'persist_gl'];
    paramsToRemove.forEach(param => {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        modified = true;
      }
    });

    // If we modified the URL, update it without reload
    if (modified) {
      console.log('[Stop YouTube Auto-Dubbing] Removing translation parameters from URL');
      window.history.replaceState(null, '', url.toString());
    }
  }

  // Observe page changes
  function observePageChanges() {
    let lastUrl = window.location.href;
    
    // Watch for URL changes
    const observer = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('[Stop YouTube Auto-Dubbing] Page changed, reapplying settings');
        
        // Wait a bit for page to load
        setTimeout(() => {
          restoreOriginalMetadata();
          monitorAudioTracks();
        }, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also watch for title changes (indicates new video loaded)
    const titleObserver = new MutationObserver(() => {
      restoreOriginalMetadata();
    });

    const titleElement = document.querySelector('title');
    if (titleElement) {
      titleObserver.observe(titleElement, {
        childList: true
      });
    }

    // Periodically check and restore
    setInterval(() => {
      if (isEnabled) {
        restoreOriginalMetadata();
      }
    }, 3000);
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Stop YouTube Auto-Dubbing] Received message:', request);
    
    if (request.action === 'toggleEnabled') {
      isEnabled = request.enabled;
      console.log('[Stop YouTube Auto-Dubbing] Toggled to:', isEnabled);
      
      if (isEnabled) {
        if (!isInitialized) {
          isInitialized = true;
          init();
        }
        // Force refresh
        restoreOriginalMetadata();
        monitorAudioTracks();
      }
      
      sendResponse({ success: true });
      return true; // Keep message channel open
    }
  });

})();
