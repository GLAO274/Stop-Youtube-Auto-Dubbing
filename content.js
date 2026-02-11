// Prevents auto-dubbing and restores original titles/descriptions

(function() {
  'use strict';

  console.log('[Stop YouTube Auto-Dubbing] Extension loaded');

  // Configuration
  let isEnabled = true;
  let originalData = {};

  // Load settings from storage
  chrome.storage.sync.get(['enabled'], function(result) {
    isEnabled = result.enabled !== false;
    if (isEnabled) {
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
      const video = document.querySelector('video');
      if (!video) return;

      // Wait for player to be ready
      const player = document.querySelector('#movie_player');
      if (!player) return;

      try {
        // Check if there are multiple audio tracks
        const audioTracks = video.audioTracks;
        if (audioTracks && audioTracks.length > 1) {
          // Find the original track
          for (let i = 0; i < audioTracks.length; i++) {
            const track = audioTracks[i];
            // Enable the first track or the one that seems original
            if (i === 0 || !track.label.toLowerCase().includes('dub')) {
              if (!track.enabled) {
                console.log('[Stop YouTube Auto-Dubbing] Switching to original audio track:', track.label);
                track.enabled = true;
              }
              break;
            }
          }
        }

        // Also check for YouTube's audio track settings menu
        const settingsButton = document.querySelector('.ytp-settings-button');
        if (settingsButton) {
          // Handle this via YouTube's player API if available
          checkYouTubePlayerAPI();
        }
      } catch (e) {
        console.error('[Stop YouTube Auto-Dubbing] Error checking audio tracks:', e);
      }
    };

    // Check periodically
    setInterval(checkAudioTrack, 2000);
    
    // Check immediately
    setTimeout(checkAudioTrack, 1000);
  }

  // Use YouTube's player API to control audio tracks
  function checkYouTubePlayerAPI() {
    try {
      const player = document.querySelector('#movie_player');
      if (player && typeof player.getOption === 'function') {
        // Get available audio tracks
        const audioTracks = player.getOption('captions', 'audioTracks');
        if (audioTracks && audioTracks.length > 0) {
          // Select the original track (first one typically)
          const currentTrack = player.getOption('captions', 'track');
          if (currentTrack && currentTrack.languageCode && currentTrack.languageCode.includes('.')) {
            // If it has a dot, it might be a dubbed version (e.g., "en.dub")
            console.log('[Stop YouTube Auto-Dubbing] Detected dubbed track, switching to original');
            player.setOption('captions', 'track', audioTracks[0]);
          }
        }
      }
    } catch (e) {
      // API might not be available yet
    }
  }

  // Function to fetch and restore original metadata
  function restoreOriginalMetadata() {
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

  // Fetch original metadata from YouTube without language parameters
  function fetchOriginalMetadata(videoId) {
    // Try to get original data from YouTube's internal API
    try {
      // YouTube stores initial data in ytInitialData
      if (window.ytInitialData) {
        const data = window.ytInitialData;
        const videoData = findVideoData(data);
        
        if (videoData) {
          const original = {
            title: videoData.title,
            description: videoData.description,
            videoId: videoId
          };
          
          originalData[videoId] = original;
          applyOriginalMetadata(original);
        }
      }

      // Also try to get from ytInitialPlayerResponse
      if (window.ytInitialPlayerResponse) {
        const playerData = window.ytInitialPlayerResponse;
        if (playerData.videoDetails) {
          const original = {
            title: playerData.videoDetails.title,
            description: playerData.videoDetails.shortDescription,
            videoId: videoId
          };
          
          originalData[videoId] = original;
          applyOriginalMetadata(original);
        }
      }
    } catch (e) {
      console.error('[Stop YouTube Auto-Dubbing] Error fetching original metadata:', e);
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
    if (request.action === 'toggleEnabled') {
      isEnabled = request.enabled;
      if (isEnabled) {
        init();
      }
      sendResponse({ success: true });
    }
  });

})();
