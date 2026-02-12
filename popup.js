// Popup script for Stop YouTube Auto-Dubbing
const toggleSwitch = document.getElementById('toggleSwitch');
const statusEl = document.getElementById('status');

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
  console.log('[Popup]', message);
}

function updateUI(enabled) {
  if (enabled) {
    toggleSwitch.classList.add('active');
  } else {
    toggleSwitch.classList.remove('active');
  }
  setStatus(enabled ? 'Extension is ON' : 'Extension is OFF', 'success');
}

// Load current state on popup open
chrome.storage.sync.get(['enabled'], function(result) {
  if (chrome.runtime.lastError) {
    console.error('[Popup] Error loading state:', chrome.runtime.lastError);
    setStatus('Error loading state', 'error');
    return;
  }
  
  const enabled = result.enabled !== false; // Default to true
  console.log('[Popup] Loaded state:', enabled);
  updateUI(enabled);
});

// Handle toggle clicks
toggleSwitch.addEventListener('click', function() {
  const isCurrentlyActive = toggleSwitch.classList.contains('active');
  const newState = !isCurrentlyActive;
  
  console.log('[Popup] Toggle clicked, changing to:', newState);
  setStatus('Saving...', '');
  
  // Save the new state
  chrome.storage.sync.set({ enabled: newState }, function() {
    if (chrome.runtime.lastError) {
      console.error('[Popup] Error saving:', chrome.runtime.lastError);
      setStatus('Error saving state', 'error');
      return;
    }
    
    console.log('[Popup] State saved successfully:', newState);
    updateUI(newState);
    
    // Find and notify YouTube tabs
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, function(tabs) {
      if (chrome.runtime.lastError) {
        console.error('[Popup] Error querying tabs:', chrome.runtime.lastError);
        return;
      }
      
      if (!tabs || tabs.length === 0) {
        console.log('[Popup] No YouTube tabs found');
        setStatus(newState ? 'ON - Open YouTube to activate' : 'OFF', 'success');
        return;
      }
      
      console.log('[Popup] Found', tabs.length, 'YouTube tabs');
      let notified = 0;
      
      tabs.forEach(function(tab) {
        chrome.tabs.sendMessage(
          tab.id,
          { action: 'toggleEnabled', enabled: newState },
          function(response) {
            if (chrome.runtime.lastError) {
              console.log('[Popup] Tab', tab.id, 'not ready:', chrome.runtime.lastError.message);
            } else {
              notified++;
              console.log('[Popup] Tab', tab.id, 'notified successfully');
              if (notified === tabs.length) {
                setStatus(newState ? 'ON - Refresh YouTube' : 'OFF - Refresh YouTube', 'success');
              }
            }
          }
        );
      });
    });
  });
});

console.log('[Popup] Script loaded');