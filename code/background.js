let timeSpent = {};
let activeTab = null;
let startTime = null;
let isTrackingPaused = false; // Track if tracking is paused
let updateInterval = null; // Track the interval for updating time

// Load saved data from storage
chrome.storage.local.get(['timeSpent', 'isTrackingPaused'], (data) => {
    if (data.timeSpent) {
        timeSpent = data.timeSpent;
    }
    if (data.isTrackingPaused !== undefined) {
        isTrackingPaused = data.isTrackingPaused;
    }
});

// Function to update time spent on the active tab
function updateTime() {
    if (!isTrackingPaused && activeTab && startTime) {
        const endTime = Date.now();
        const timeElapsed = Math.floor((endTime - startTime) / 1000);
        if (timeElapsed > 0) {
            timeSpent[activeTab] = (timeSpent[activeTab] || 0) + timeElapsed;
            chrome.storage.local.set({ timeSpent });
            startTime = endTime;
        }
    }
}

// Function to start or stop the update interval based on the pause state
function manageUpdateInterval() {
    if (isTrackingPaused) {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
    } else {
        if (!updateInterval) {
            updateInterval = setInterval(updateTime, 1000);
        }
    }
}

// Function to track the currently active tab
function trackActiveTab(tabId) {
    chrome.tabs.get(tabId, (tab) => {
        if (tab && tab.url) {
            updateTime();
            activeTab = new URL(tab.url).hostname.replace(/^www\./, '');
            startTime = Date.now();
        }
    });
}

// When tab is activated
chrome.tabs.onActivated.addListener((activeInfo) => {
    trackActiveTab(activeInfo.tabId);
});

// When a tab is updated (reload, new page)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.url) {
        trackActiveTab(tabId);
    }
});

// Handle window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        updateTime();
        activeTab = null;
        startTime = null;
    } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) trackActiveTab(tabs[0].id);
        });
    }
});

// Handle messages from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getTimeData") {
        updateTime();
        sendResponse({ timeSpent, activeTab, startTime, isTrackingPaused });
    } else if (request.action === "clearData") {
        timeSpent = {};
        chrome.storage.local.set({ timeSpent: {} }, () => {
            sendResponse({ success: true });
        });
        return true;
    } else if (request.action === "setTrackingState") {
        isTrackingPaused = request.paused;
        chrome.storage.local.set({ isTrackingPaused });

        // Update startTime when resuming tracking
        if (!isTrackingPaused && activeTab) {
            startTime = Date.now(); // Reset startTime to the current time
        }

        manageUpdateInterval(); // Start or stop the interval based on the pause state
        sendResponse({ success: true });
        return true;
    }
    return true;
});

// Start the interval initially
manageUpdateInterval();