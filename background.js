// Background script for managing content script injection

// Track injected tabs to prevent multiple injections
const injectedTabs = new Set();

// Listen for tab updates to inject content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only inject into fully loaded tabs that match our URL pattern
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
        // Skip if we've already injected into this tab
        if (injectedTabs.has(tabId)) return;
        
        // Add to injected tabs set
        injectedTabs.add(tabId);
        
        // Inject content scripts in the correct order
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['dist/wink-nlp-bundle.js']
        }).then(() => {
            return chrome.scripting.executeScript({
                target: { tabId },
                files: ['dist/content.js']
            });
        }).catch(err => {
            console.error('Error injecting content scripts:', err);
            injectedTabs.delete(tabId); // Reset if injection failed
        });
    }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
});
