// Stop YouTube Auto-Dubbing - Ultra-safe version
(function() {
  'use strict';

  // Prevent multiple instances
  if (window.__stopYTAutoDubbing) {
    console.log('[Stop YouTube Auto-Dubbing] Already running, skipping');
    return;
  }
  window.__stopYTAutoDubbing = true;

  console.log('[Stop YouTube Auto-Dubbing] Extension loaded');

  // State
  let isEnabled = true;
  let monitoringInterval = null;
  let lastCheckedVideoId = null;

  // Initialize
  function init() {
    // Load settings from storage
    try {
      chrome.storage.sync.get(['enabled'], function(result) {
        if (chrome.runtime.lastError) {
          console.log('[Stop YouTube Auto-Dubbing] Storage error:', chrome.runtime.lastError.message);
          isEnabled = true; // Default to enabled
        } else {
          isEnabled = result.enabled !== false;
        }
        console.log('[Stop YouTube Auto-Dubbing] Extension enabled:', isEnabled);
        
        if (isEnabled) {
          startMonitoring();
        }
      });
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Init error:', e.message);
      isEnabled = true;
      startMonitoring();
    }

    // Setup message listener
    setupMessageListener();
    
    // Setup navigation observer
    setupNavigationObserver();
  }

  // Start monitoring videos
  function startMonitoring() {
    if (monitoringInterval) {
      return; // Already monitoring
    }

    console.log('[Stop YouTube Auto-Dubbing] Starting video monitoring');
    
    // Check immediately
    checkCurrentVideo();
    
    // Then check every 2 seconds
    monitoringInterval = setInterval(checkCurrentVideo, 2000);
  }

  // Stop monitoring
  function stopMonitoring() {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
      console.log('[Stop YouTube Auto-Dubbing] Stopped monitoring');
    }
  }

  // Check and fix current video
  function checkCurrentVideo() {
    if (!isEnabled) return;
    
    // Only process on watch pages
    if (!location.pathname.startsWith('/watch')) return;
    
    // Get video ID
    const videoId = getVideoId();
    if (!videoId) return;
    
    // Track if this is a new video
    const isNewVideo = (videoId !== lastCheckedVideoId);
    if (isNewVideo) {
      lastCheckedVideoId = videoId;
      console.log('[Stop YouTube Auto-Dubbing] New video:', videoId);
    }
    
    // Fix audio track
    fixAudioTrack();
    
    // Fix metadata on new videos
    if (isNewVideo) {
      // Try multiple times as page loads
      setTimeout(() => fixMetadata(), 500);
      setTimeout(() => fixMetadata(), 1500);
      setTimeout(() => fixMetadata(), 3000);
    }
  }

  // Get current video ID
  function getVideoId() {
    try {
      const params = new URLSearchParams(location.search);
      return params.get('v');
    } catch (e) {
      return null;
    }
  }

  // Fix audio track to original
  function fixAudioTrack() {
    try {
      const video = document.querySelector('video');
      if (!video) return;
      
      const tracks = video.audioTracks;
      if (!tracks || tracks.length <= 1) return;
      
      // Check if first track is enabled
      if (tracks[0].enabled) return;
      
      // Switch to first track (original)
      console.log('[Stop YouTube Auto-Dubbing] Switching to original audio (track 0)');
      tracks[0].enabled = true;
      
      // Disable other tracks
      for (let i = 1; i < tracks.length; i++) {
        tracks[i].enabled = false;
      }
    } catch (e) {
      // Silent - audio tracks API may not be available
    }
  }

  // Fix video metadata
  function fixMetadata() {
    const metadata = getOriginalMetadata();
    if (!metadata) return;
    
    if (metadata.title) {
      setPageTitle(metadata.title);
    }
    
    if (metadata.description) {
      setPageDescription(metadata.description);
    }
  }

  // Get original metadata from page
  function getOriginalMetadata() {
    try {
      // Try ytInitialPlayerResponse (most reliable)
      if (typeof window.ytInitialPlayerResponse !== 'undefined') {
        const player = window.ytInitialPlayerResponse;
        if (player && player.videoDetails) {
          return {
            title: player.videoDetails.title,
            description: player.videoDetails.shortDescription
          };
        }
      }
    } catch (e) {
      // Silent
    }
    return null;
  }

  // Set page title
  function setPageTitle(title) {
    try {
      // Update title elements
      const titleSelectors = [
        'h1.ytd-watch-metadata yt-formatted-string',
        'h1 yt-formatted-string'
      ];
      
      let updated = false;
      titleSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.textContent !== title) {
            el.textContent = title;
            updated = true;
          }
        });
      });
      
      // Update document title
      if (document.title !== title + ' - YouTube') {
        document.title = title + ' - YouTube';
        updated = true;
      }
      
      if (updated) {
        console.log('[Stop YouTube Auto-Dubbing] Updated title');
      }
    } catch (e) {
      // Silent
    }
  }

  // Set page description
  function setPageDescription(description) {
    try {
      const descSelectors = [
        '#description-inline-expander yt-formatted-string',
        'ytd-text-inline-expander yt-formatted-string'
      ];
      
      let updated = false;
      descSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.textContent !== description) {
            el.textContent = description;
            updated = true;
          }
        });
      });
      
      if (updated) {
        console.log('[Stop YouTube Auto-Dubbing] Updated description');
      }
    } catch (e) {
      // Silent
    }
  }

  // Setup message listener for popup
  function setupMessageListener() {
    try {
      chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        console.log('[Stop YouTube Auto-Dubbing] Message received:', request);
        
        if (request.action === 'toggleEnabled') {
          isEnabled = request.enabled;
          console.log('[Stop YouTube Auto-Dubbing] Toggled to:', isEnabled);
          
          if (isEnabled) {
            startMonitoring();
            checkCurrentVideo();
          } else {
            stopMonitoring();
          }
          
          sendResponse({ success: true, enabled: isEnabled });
        }
        
        return true; // Keep channel open
      });
    } catch (e) {
      console.log('[Stop YouTube Auto-Dubbing] Message listener error:', e.message);
    }
  }

  // Setup navigation observer for YouTube SPA
  function setupNavigationObserver() {
    let lastUrl = location.href;
    
    // Use mutation observer to detect URL changes
    const observer = new MutationObserver(function() {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        lastCheckedVideoId = null; // Reset on navigation
        console.log('[Stop YouTube Auto-Dubbing] Page navigated');
        
        if (isEnabled) {
          setTimeout(() => checkCurrentVideo(), 500);
        }
      }
    });
    
    // Observe document for changes
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Start the extension
  // Use setTimeout to ensure page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }

})();