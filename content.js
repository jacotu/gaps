// Gaps Chrome Extension
// Content script with winkNLP and en-pos for accurate POS tagging

// Create a unique ID for this script instance
const SCRIPT_ID = `pos-tagger-script-${(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? chrome.runtime.id : 'unknown'}`;

// Check if already injected
const POS_TAGGER_ALREADY_INJECTED = !!window[SCRIPT_ID];

// Mark as injected
if (!POS_TAGGER_ALREADY_INJECTED) {
    window[SCRIPT_ID] = true;
}

// Import en-pos for enhanced POS tagging
let enPos;
try {
    enPos = require('en-pos');
} catch (e) {
    console.warn('en-pos module not available:', e);
    enPos = null;
}

function getEnPosTagCtor() {
    if (!enPos) return null;
    if (typeof enPos.Tag === 'function') return enPos.Tag;
    if (enPos.default && typeof enPos.default.Tag === 'function') return enPos.default.Tag;
    return null;
}

// Add a class to the document element to indicate script is loaded
document.documentElement.classList.add('pos-tagger-loaded');

(function() {
    'use strict';
    
    if (POS_TAGGER_ALREADY_INJECTED) {
        console.log('POS Tagger already injected, skipping');
        return;
    }
    
    // Debug logging
    console.log('Content script loaded - version 1.0.0');
    console.log('Extension ID:', chrome.runtime.id);
    console.log('Extension URL:', chrome.runtime.getURL(''));
    
    // Check if chrome.runtime is available
    if (!chrome.runtime || !chrome.runtime.id) {
        console.error('Chrome runtime not available. This script should run as a Chrome extension.');
        return;
    }
    
    // Check if we're in an iframe
    if (window.self !== window.top) {
        console.log('Running in an iframe, skipping initialization');
        return;
    }

    // Load Schflooze font
    function loadSchfloozeFont() {
        if (!document.head) {
            setTimeout(loadSchfloozeFont, 50);
            return;
        }
        
        if (document.querySelector('style[data-schflooze-font]')) {
            return;
        }
        
        const fontUrl = chrome.runtime.getURL('Schflooze-Regular.otf');
        const style = document.createElement('style');
        style.setAttribute('data-schflooze-font', 'true');
        style.textContent = `
            @font-face {
                font-family: 'Schflooze';
                src: url('${fontUrl}') format('opentype');
                font-weight: normal;
                font-style: normal;
                font-display: swap;
            }
        `;
        document.head.appendChild(style);
    }

    if (document.head) {
        loadSchfloozeFont();
    } else {
        document.addEventListener('DOMContentLoaded', loadSchfloozeFont);
    }
    
    // Add global style for POS tags
    function addGlobalTagStyle() {
        if (!document.head) {
            setTimeout(addGlobalTagStyle, 50);
            return;
        }
        
        if (document.querySelector('style[data-pos-tag-font]')) {
            return;
        }
        
        const fontUrl = chrome.runtime.getURL('Schflooze-Regular.otf');
        const style = document.createElement('style');
        style.setAttribute('data-pos-tag-font', 'true');
        style.textContent = `
            @font-face {
                font-family: 'Schflooze';
                src: url('${fontUrl}') format('opentype');
                font-weight: normal;
                font-style: normal;
                font-display: swap;
            }
            .pos-tag-extension {
                font-family: 'Schflooze', Arial, sans-serif !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    if (document.head) {
        addGlobalTagStyle();
    } else {
        document.addEventListener('DOMContentLoaded', addGlobalTagStyle);
    }

    // Configuration
    const CONFIG = {
        POS_TAGS: {
            'Noun': { name: 'Noun', class: 'pos-NOUN-extension' },
            'Verb': { name: 'Verb', class: 'pos-VERB-extension' },
            'Adjective': { name: 'Adjective', class: 'pos-ADJ-extension' },
            'Adverb': { name: 'Adverb', class: 'pos-ADV-extension' },
            'Pronoun': { name: 'Pronoun', class: 'pos-PRON-extension' },
            'Determiner': { name: 'Determiner', class: 'pos-DET-extension' },
            'Preposition': { name: 'Preposition', class: 'pos-ADP-extension' },
            'Conjunction': { name: 'Conjunction', class: 'pos-CONJ-extension' },
            'Value': { name: 'Number', class: 'pos-NUM-extension' },
            'Particle': { name: 'Particle', class: 'pos-PART-extension' },
            'NOUN': { name: 'Noun', class: 'pos-NOUN-extension' },
            'VERB': { name: 'Verb', class: 'pos-VERB-extension' },
            'ADJ': { name: 'Adjective', class: 'pos-ADJ-extension' },
            'ADV': { name: 'Adverb', class: 'pos-ADV-extension' },
            'PRON': { name: 'Pronoun', class: 'pos-PRON-extension' },
            'DET': { name: 'Determiner', class: 'pos-DET-extension' },
            'ADP': { name: 'Preposition', class: 'pos-ADP-extension' },
            'CONJ': { name: 'Conjunction', class: 'pos-CONJ-extension' },
            'NUM': { name: 'Number', class: 'pos-NUM-extension' },
            'PART': { name: 'Particle', class: 'pos-PART-extension' },
            'X': { name: 'Other', class: 'pos-X-extension' },
            'PROPN': { name: 'Proper Noun', class: 'pos-PROPN-extension' },
            'AUX': { name: 'Auxiliary', class: 'pos-AUX-extension' },
            'CCONJ': { name: 'Conjunction', class: 'pos-CONJ-extension' },
            'SCONJ': { name: 'Subord. Conj.', class: 'pos-CONJ-extension' },
            'INTJ': { name: 'Interjection', class: 'pos-INTJ-extension' },
            'UNKNOWN': { name: 'Unknown', class: 'pos-UNKNOWN-extension' }
        },
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        initialX: 0,
        initialY: 0
    };

    // Application state
    let appState = {
        originalContent: new Map(),
        isTagged: false,
        controlPanel: null,
        winkNLP: null,
        winkNLPLoaded: false,
        winkNLPModel: null,
        enPosLoaded: false,
        words: [],
        posTags: [],
        originalText: '', // Store original text for context matching
        sentences: [] // Store sentences for context
    };

    // Update model status in UI
    function updateModelStatus(message, isLoaded = false) {
        setTimeout(() => {
            const statusEl = document.getElementById('modelStatusText');
            if (statusEl) {
                statusEl.textContent = message;
                statusEl.style.color = isLoaded ? '#166534' : '#dc2626';
            }
        }, 100);
    }

    // Load winkNLP from local bundle (loaded via manifest.json)
    async function loadWinkNLP() {
        if (appState.winkNLPLoaded) {
            return true;
        }

        try {
            // Wait a bit for bundle to load (it's in manifest.json, so it should be available)
            // Check multiple times as bundle might load asynchronously
            for (let i = 0; i < 30; i++) {
                // Priority 1: Check if winkNLP is directly on window (from bundle's initialization code)
                if (typeof window.winkNLP !== 'undefined' && window.winkNLPModel) {
                    appState.winkNLPModel = window.winkNLPModel;
                    appState.winkNLPLoaded = true;
                    return true;
                }
                
                // Priority 2: Check winkNLPBundle object (webpack export)
                if (typeof window.winkNLPBundle !== 'undefined') {
                    const bundle = window.winkNLPBundle;
                    if (bundle.model && bundle.winkNLP) {
                        // Extract from bundle and set on window for consistency
                        window.winkNLP = bundle.winkNLP;
                        window.winkNLPModel = bundle.model;
                        appState.winkNLPModel = bundle.model;
                        appState.winkNLPLoaded = true;
                        return true;
                    }
                }
                
                // Wait a bit before next check
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.warn('winkNLP bundle not found after waiting.');
            return false;
        } catch (error) {
            console.error('Error initializing winkNLP:', error);
            return false;
        }
    }

    // Check if winkNLP is available
    async function checkWinkNLP() {
        if (appState.winkNLPLoaded) {
            return true;
        }
        
        const loaded = await loadWinkNLP();
        if (loaded) {
            updateModelStatus('winkNLP loaded - ready', true);
        } else {
            updateModelStatus('winkNLP not loaded', false);
        }
        return loaded;
    }

    // Check for winkNLP after scripts load
    function checkAllLibraries() {
        // Wait a bit for winkNLP bundle to load
        setTimeout(async () => {
            // Initialize the application when the DOM is fully loaded
            function initApp() {
                console.log('Initializing application...');
                try {
                    // Check if required elements exist
                    if (!document.body) {
                        console.error('Document body not found');
                        return;
                    }
                    
                    // Check if control panel already exists
                    if (document.getElementById('controlPanelPosTagger')) {
                        console.log('Control panel already exists');
                        return;
                    }
                    
                    // Initialize the application
                    init();
                    console.log('Application initialized successfully');
                } catch (error) {
                    console.error('Error initializing application:', error);
                }
            }
            
            if (document.readyState === 'loading') {
                console.log('Waiting for DOM to load...');
                document.addEventListener('DOMContentLoaded', initApp);
            } else {
                console.log('DOM already loaded, initializing...');
                initApp();
            }
            await checkWinkNLP();
        }, 500);
    }

    function startInitialization() {
        console.log('Starting extension initialization...');
        console.log('Document readyState:', document.readyState);
        
        // Check if we're on a chrome:// URL where content scripts might be restricted
        if (window.location.protocol === 'chrome:') {
            console.log('Chrome internal page detected, skipping initialization');
            return;
        }
        
        // Check if already initialized
        if (document.querySelector('#controlPanelPosTagger')) {
            console.log('Control panel already exists, skipping initialization');
            return;
        }
        
        // Add a small delay to ensure the page is fully loaded
        setTimeout(() => {
            if (document.readyState === 'loading') {
                console.log('DOM not ready yet, waiting for DOMContentLoaded');
                document.addEventListener('DOMContentLoaded', checkAllLibraries);
            } else {
                console.log('DOM already loaded, checking libraries');
                checkAllLibraries();
            }
        }, 300); // 300ms delay to ensure everything is ready
    }
    
    // Start the initialization
    startInitialization();

    // Check if panel already exists
    if (document.getElementById('controlPanelPosTagger')) {
        // Panel already exists
        return;
    }

    // Create and inject the control panel
    function createControlPanel() {
        // Creating control panel
        
        const panel = document.createElement('div');
        panel.id = 'controlPanelPosTagger';
        panel.className = 'control-panel-pos-tagger';
        
        const fontUrl = chrome.runtime.getURL('Schflooze-Regular.otf');
        panel.setAttribute('style', `
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            width: 300px !important;
            background: rgba(255, 255, 255, 0.98) !important;
            border-radius: 12px !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1) !important;
            border: 1px solid rgba(255, 255, 255, 0.5) !important;
            padding: 0 !important;
            z-index: 2147483647 !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            font-family: 'Schflooze', Arial, sans-serif !important;
        `);
        
        panel.innerHTML = `
            <div class="panel-header-pos-tagger">
                <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                    <h3 class="panel-title-pos-tagger">Gaps</h3>
                    <div style="font-size: 10px; color: #94a3b8; text-align: center; margin-top: 4px; font-weight: 400;">built by jacotu</div>
                </div>
            </div>
            <div class="panel-content-pos-tagger">
                <div class="controls-pos-tagger">
                    <button id="tagBtnPosTagger" class="btn-pos-tagger">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                            <line x1="7" y1="7" x2="7.01" y2="7"></line>
                        </svg>
                        Tag Text
                    </button>
                    <button id="clearBtnPosTagger" class="btn-pos-tagger btn-clear-pos-tagger">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                        Clear
                    </button>
                </div>
                <div style="border-top: 1px solid rgba(203, 213, 225, 0.3); margin-top: 12px; padding-top: 0;">
                    <div style="display: flex; gap: 8px; padding: 4px; background: #f1f5f9; border-radius: 8px; margin-bottom: 12px;">
                        <button class="tab-btn-unsaid active" data-tab="statistics" style="flex: 1; padding: 8px 12px; background: white; border: 1px solid rgba(203, 213, 225, 0.3); border-radius: 6px; color: #1e293b; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.2s;">Said</button>
                        <button class="tab-btn-unsaid" data-tab="unsaid" style="flex: 1; padding: 8px 12px; background: transparent; border: 1px solid transparent; border-radius: 6px; color: #64748b; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s;">Unsaid</button>
                    </div>
                    <div id="tabContentStatistics" class="tab-content-unsaid active">
                <div class="stats-pos-tagger" id="statsContainerPosTagger">
                    <p style="margin: 0; color: #64748b; font-size: 13px; text-align: center;">
                        Click "Tag Text" to analyze the document
                    </p>
                        </div>
                    </div>
                    <div id="tabContentUnsaid" class="tab-content-unsaid" style="display: none;">
                        <div id="unsaidContainer">
                            <p style="margin: 0; color: #64748b; font-size: 13px; text-align: center;">
                                Click "Tag Text" to analyze the document
                            </p>
                        </div>
                    </div>
                </div>
                <div id="searchPanelPosTagger" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(203, 213, 225, 0.3);">
                    <div style="margin-bottom: 12px;">
                        <div style="position: relative; margin-bottom: 8px;">
                            <select id="posFilterPosTagger" class="select-pos-tagger">
                                <option value="all">All Parts of Speech</option>
                            </select>
                        </div>
                        <input type="text" id="wordSearchPosTagger" placeholder="Search for words..." style="width: 100%; padding: 8px; border: 1px solid rgba(203, 213, 225, 0.5); border-radius: 6px; font-size: 13px; background: white; color: #1e293b; box-sizing: border-box;">
                    </div>
                    <div id="searchResultsPosTagger" style="max-height: 300px; overflow-y: auto;">
                        <!-- Search results will be displayed here -->
                    </div>
                </div>
                <div id="modelStatusPosTagger" style="font-size: 11px; color: #64748b; text-align: center; padding: 8px 0; border-top: 1px solid rgba(203, 213, 225, 0.3); margin-top: 12px;">
                    <span id="modelStatusText">Checking winkNLP...</span>
                </div>
            </div>
        `;
        
        if (!document.body) {
            // Body not ready, waiting
            setTimeout(createControlPanel, 100);
            return;
        }
        
        document.body.appendChild(panel);
        appState.controlPanel = panel;
        
        // Setup tabs immediately
        setTimeout(() => {
            setupTabs();
        }, 100);
        
        const panelStyle = document.createElement('style');
        panelStyle.textContent = `
            @font-face {
                font-family: 'Schflooze';
                src: url('${fontUrl}') format('opentype');
                font-weight: normal;
                font-style: normal;
                font-display: swap;
            }
            #controlPanelPosTagger, #controlPanelPosTagger * {
                font-family: 'Schflooze', Arial, sans-serif !important;
            }
        `;
        panel.insertBefore(panelStyle, panel.firstChild);
        
        panel.style.display = 'block';
        panel.style.visibility = 'visible';
        panel.style.opacity = '1';
        
        // Panel created and appended to body
        
        setTimeout(() => {
            setupEventListeners();
            setupDraggablePanel(panel);
            loadPanelPosition(panel);
        }, 100);
        
        return panel;
    }

    function setupEventListeners() {
        const tagBtn = document.getElementById('tagBtnPosTagger');
        const clearBtn = document.getElementById('clearBtnPosTagger');
        
        if (tagBtn) {
            tagBtn.addEventListener('click', analyzePage);
            tagBtn.disabled = false;
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', clearAnalysis);
        }
    }

    function setupDraggablePanel(panel) {
        const header = panel.querySelector('.panel-header-pos-tagger');
        if (!header) return;
        
        header.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', stopDrag, { passive: false });
        
        header.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
        
        header.addEventListener('selectstart', (e) => {
            if (CONFIG.isDragging) e.preventDefault();
        });
    }

    function startDrag(e) {
        e.preventDefault();
        const panel = appState.controlPanel;
        if (!panel) return;
        
        CONFIG.isDragging = true;
        CONFIG.dragStartX = e.clientX || e.touches[0].clientX;
        CONFIG.dragStartY = e.clientY || e.touches[0].clientY;
        CONFIG.initialX = panel.offsetLeft;
        CONFIG.initialY = panel.offsetTop;
        
        panel.classList.add('dragging-pos-tagger');
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
    }

    function drag(e) {
        if (!CONFIG.isDragging) return;
        e.preventDefault();
        
        const panel = appState.controlPanel;
        if (!panel) return;
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        if (clientX === undefined || clientY === undefined) return;
        
        const dx = clientX - CONFIG.dragStartX;
        const dy = clientY - CONFIG.dragStartY;
        
        let newX = CONFIG.initialX + dx;
        let newY = CONFIG.initialY + dy;
        
        const panelRect = panel.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (newX < 0) newX = 0;
        if (newX + panelRect.width > viewportWidth) newX = viewportWidth - panelRect.width;
        
        if (newY < 0) newY = 0;
        if (newY + panelRect.height > viewportHeight) newY = viewportHeight - panelRect.height;
        
        panel.style.left = `${newX}px`;
        panel.style.top = `${newY}px`;
        panel.style.right = 'auto';
    }

    function stopDrag(e) {
        if (!CONFIG.isDragging) return;
        
        const panel = appState.controlPanel;
        if (!panel) return;
        
        CONFIG.isDragging = false;
        
        const position = {
            x: panel.offsetLeft,
            y: panel.offsetTop
        };
        chrome.storage.local.set({ 'posTaggerPanelPosition': position });
        
        panel.classList.remove('dragging-pos-tagger');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    function loadPanelPosition(panel) {
        chrome.storage.local.get(['posTaggerPanelPosition'], (result) => {
            if (result.posTaggerPanelPosition) {
                panel.style.left = `${result.posTaggerPanelPosition.x}px`;
                panel.style.top = `${result.posTaggerPanelPosition.y}px`;
                panel.style.right = 'auto';
            }
        });
    }

    function getTextContent() {
        const body = document.body.cloneNode(true);
        
        const panel = body.querySelector('#controlPanelPosTagger');
        if (panel) {
            panel.remove();
        }
        
        const scripts = body.querySelectorAll('script, style, noscript');
        scripts.forEach(el => el.remove());
        
        const tags = body.querySelectorAll('.pos-tag-extension');
        tags.forEach(tag => {
            tag.replaceWith(tag.textContent);
        });
        
        // Add spaces between adjacent text nodes from different elements
        // This prevents words from gluing together like "TopicsArt" -> "Topics Art"
        function addSpacesRecursive(element) {
            const children = Array.from(element.childNodes);
            const nodesToAdd = [];
            
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                
                // Recursively process child elements
                if (child.nodeType === Node.ELEMENT_NODE) {
                    addSpacesRecursive(child);
                }
                
                // Check if we need to add space between this and previous element
                if (i > 0 && child.nodeType === Node.ELEMENT_NODE) {
                    const prevChild = children[i - 1];
                    if (prevChild.nodeType === Node.ELEMENT_NODE) {
                        const prevText = prevChild.textContent.trim();
                        const currText = child.textContent.trim();
                        const needsSpace = prevText && currText && 
                            !/[\s\-–—]$/.test(prevText) && 
                            !/^[\s\-–—\.,;:!?\)\]\}]/.test(currText);
                        
                        if (needsSpace) {
                            nodesToAdd.push({ index: i, node: document.createTextNode(' ') });
                        }
                    }
                }
            }
            
            // Add spaces in reverse order to maintain correct indices
            nodesToAdd.reverse().forEach(({ index, node }) => {
                element.insertBefore(node, children[index]);
            });
        }
        
        addSpacesRecursive(body);
        
        // Get text and normalize whitespace
        let text = body.textContent || body.innerText || '';
        
        // Debug: log original text snippet to see if words are glued
        const debugSnippet = text.substring(0, 2000);
        if (debugSnippet.includes('Topicsart') || debugSnippet.includes('laborMost') || debugSnippet.includes('AuthorNick')) {
            console.log('=== DEBUG: Found glued words in original text ===');
            console.log('Has Topicsart:', debugSnippet.includes('Topicsart'));
            console.log('Has laborMost:', debugSnippet.includes('laborMost'));
            console.log('Has AuthorNick:', debugSnippet.includes('AuthorNick'));
            const topicsartIndex = debugSnippet.indexOf('Topicsart');
            if (topicsartIndex >= 0) {
                console.log('Context around Topicsart:', debugSnippet.substring(Math.max(0, topicsartIndex - 50), topicsartIndex + 100));
            }
        }
        
        // Post-process: Add spaces between words that are glued together
        // This is critical for cases like "Topicsart", "laborMost", "AuthorNick"
        
        // Direct replacements FIRST for known problematic cases
        const directReplacements = [
            { from: /Topicsart/gi, to: 'Topics art' },
            { from: /laborMost/gi, to: 'labor Most' },
            { from: /AuthorNick/gi, to: 'Author Nick' },
            { from: /GeislerNick/gi, to: 'Geisler Nick' },
            { from: /GeislerIllustration/gi, to: 'Geisler Illustration' },
            { from: /TerceroDecember/gi, to: 'Tercero December' },
            { from: /ShareSave/gi, to: 'Share Save' },
            { from: /WorkArtificial/gi, to: 'Work Artificial' },
            { from: /WorkNick/gi, to: 'Work Nick' }
        ];
        
        let directMatches = 0;
        directReplacements.forEach(({ from, to }) => {
            if (text.match(from)) {
                directMatches++;
                text = text.replace(from, to);
                console.log(`Direct replacement: "${from.source}" -> "${to}"`);
            }
        });
        if (directMatches > 0) {
            console.log(`Direct replacements: ${directMatches} matches`);
        }
        
        // Pattern 1: Handle glued words like "Topicsart" -> "Topics art" 
        // REMOVED 'art' from the list because it's a suffix of many valid English words
        // (start, heart, smart, dart, cart, part, etc.)
        // Only split on very specific known problematic combinations
        const validWordsWithArt = ['start', 'heart', 'smart', 'depart', 'restart', 'apart', 'cart', 'dart', 'mart', 'part', 'tart', 'chart', 'impart', 'upstart', 'rampart', 'counterpart', 'sweetheart', 'jumpstart', 'kickstart', 'headstart'];
        const knownLowercaseWords = ['music', 'labor', 'author', 'nick', 'topics'];
        let pattern1Matches = 0;
        knownLowercaseWords.forEach(word => {
            // Match: [any word ending with letter][known word starting with lowercase]
            // Example: "Topicsart" -> "Topics" + "art"
            // NO word boundary - these are glued words!
            const regex = new RegExp(`([a-zA-Z]{2,})(${word})(?![a-zA-Z])`, 'gi');
            text = text.replace(regex, (match, p1, p2) => {
                // Don't split if the whole word is a valid English word
                if (validWordsWithArt.includes(match.toLowerCase())) {
                    return match;
                }
                // Only split if p1 is at least 2 chars and p2 is a known word
                if (p1.length >= 2 && knownLowercaseWords.includes(p2.toLowerCase())) {
                    pattern1Matches++;
                    if (pattern1Matches <= 5) {
                        console.log(`Pattern 1: Split "${match}" -> "${p1} ${p2}"`);
                    }
                    return `${p1} ${p2}`;
                }
                return match;
            });
        });
        if (pattern1Matches > 0) {
            console.log(`Pattern 1 total matches: ${pattern1Matches}`);
        }
        
        // Pattern 2: lowercase letter followed by uppercase letter (e.g., "TopicsArt" -> "Topics Art")
        text = text.replace(/([a-z])([A-Z])/g, '$1 $2');
        
        // Pattern 3: uppercase letter followed by lowercase, but only if previous char is lowercase
        // This handles cases like "sArt" -> "s Art"
        text = text.replace(/([a-z])([A-Z][a-z])/g, '$1 $2');
        
        // Pattern 4: word ending with letter followed by word starting with uppercase (e.g., "laborMost" -> "labor Most")
        text = text.replace(/([a-zA-Z]{2,})([A-Z][a-z]{2,})/g, '$1 $2');
        
        // Pattern 5: number followed by letter or vice versa (e.g., "2023The" -> "2023 The")
        text = text.replace(/(\d)([A-Za-z])/g, '$1 $2');
        text = text.replace(/([A-Za-z])(\d)/g, '$1 $2');
        
        // Pattern 6: Handle specific common words that might be glued
        // These are known problematic cases from the page
        const knownGluedWords = [
            // Common word endings followed by common word beginnings
            { pattern: /Topicsart/gi, replacement: 'Topics art' },
            { pattern: /laborMost/gi, replacement: 'labor Most' },
            { pattern: /AuthorNick/gi, replacement: 'Author Nick' },
            { pattern: /GeislerNick/gi, replacement: 'Geisler Nick' },
            { pattern: /GeislerIllustration/gi, replacement: 'Geisler Illustration' },
            { pattern: /TerceroDecember/gi, replacement: 'Tercero December' },
            { pattern: /ShareSave/gi, replacement: 'Share Save' },
            { pattern: /WorkArtificial/gi, replacement: 'Work Artificial' },
            { pattern: /WorkNick/gi, replacement: 'Work Nick' },
            // Handle common word + lowercase word patterns
            { pattern: /(\bTopics)(art\b)/gi, replacement: '$1 $2' },
            { pattern: /(\blabor)(Most\b)/gi, replacement: '$1 $2' },
            { pattern: /(\bAuthor)(Nick\b)/gi, replacement: '$1 $2' },
            { pattern: /(\bGeisler)(Nick\b)/gi, replacement: '$1 $2' },
            { pattern: /(\bGeisler)(Illustration\b)/gi, replacement: '$1 $2' },
            { pattern: /(\bTercero)(December\b)/gi, replacement: '$1 $2' },
            { pattern: /(\bShare)(Save\b)/gi, replacement: '$1 $2' },
            { pattern: /(\bWork)(Artificial\b)/gi, replacement: '$1 $2' },
            { pattern: /(\bWork)(Nick\b)/gi, replacement: '$1 $2' }
        ];
        
        knownGluedWords.forEach(({ pattern, replacement }) => {
            text = text.replace(pattern, replacement);
        });
        
        // Pattern 6: More aggressive - split known words even if next word starts lowercase
        // This handles cases like "Topicsart" where "art" is a known word
        const knownWords = ['art', 'music', 'labor', 'author', 'nick', 'geisler', 'topics'];
        knownWords.forEach(word => {
            // Look for pattern: [word][knownWord] where knownWord starts with lowercase
            const regex = new RegExp(`(\\b${word})([a-z]{2,}\\b)`, 'gi');
            text = text.replace(regex, (match, p1, p2) => {
                // Check if p2 is a known word
                const p2Lower = p2.toLowerCase();
                if (knownWords.includes(p2Lower)) {
                    return `${p1} ${p2}`;
                }
                return match;
            });
        });
        
        // Normalize whitespace: multiple spaces/tabs/newlines -> single space
        text = text.replace(/\s+/g, ' ').trim();
        
        // Debug: check if words were separated
        if (text.includes('Topics art') || text.includes('labor Most') || text.includes('Author Nick')) {
            console.log('=== DEBUG: Words successfully separated ===');
            console.log('Found "Topics art":', text.includes('Topics art'));
            console.log('Found "labor Most":', text.includes('labor Most'));
            console.log('Found "Author Nick":', text.includes('Author Nick'));
        } else if (text.includes('Topicsart') || text.includes('laborMost') || text.includes('AuthorNick')) {
            console.warn('=== DEBUG: Words still glued after processing ===');
            console.warn('Still has "Topicsart":', text.includes('Topicsart'));
            console.warn('Still has "laborMost":', text.includes('laborMost'));
            console.warn('Still has "AuthorNick":', text.includes('AuthorNick'));
        }
        
        return text;
    }

    function saveOriginalContent() {
        if (appState.isTagged) return;
        
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            const parent = node.parentNode;
            if (parent && parent.nodeName !== 'SCRIPT' && parent.nodeName !== 'STYLE' && !parent.closest('#controlPanelPosTagger')) {
                textNodes.push(node);
                appState.originalContent.set(node, node.nodeValue);
            }
        }
    }

    // Initialize en-pos
    function initEnPos() {
        try {
            const TagCtor = getEnPosTagCtor();
            if (TagCtor) {
                appState.enPosTaggerCtor = TagCtor;
                appState.enPosLoaded = true;
                return true;
            }
        } catch (e) {
            console.error('Error initializing en-pos:', e);
        }
        appState.enPosTaggerCtor = null;
        return false;
    }

    // Enhanced POS tagging using both winkNLP and en-pos
    function enhancedPosTagging(text) {
        if (!appState.winkNLPLoaded || !appState.winkNLPModel || !window.winkNLP) {
            throw new Error('winkNLP is not loaded');
        }

        // Initialize en-pos if not already done
        if (!appState.enPosLoaded) {
            appState.enPosLoaded = initEnPos();
        }

        console.log('Original text:', text);

        const nlp = window.winkNLP(appState.winkNLPModel);
        const doc = nlp.readDoc(text);
        const its = nlp.its;
        const posIts = getWinkPosIts(its);
        
        const words = [];
        const posTags = [];
        const sentenceTexts = [];
        
        // Get sentences for context
        const sentences = doc.sentences();
        
        // Process all tokens
        sentences.each((sentence) => {
            const tokens = sentence.tokens();
            const sentenceWords = [];
            const sentenceTags = [];
            
            // First pass: collect all winkNLP tokens
            console.log('=== Processing sentence ===');
            
            // Ensure tokens is a valid winkNLP tokens object
            if (!tokens || typeof tokens.each !== 'function') {
                console.error('Invalid tokens object:', tokens);
                return; // Skip this sentence
            }
            
            console.log('Raw tokens:', tokens.length || 'unknown');
            
            const rawTokens = [];
            tokens.each((token, index) => {
                const word = token.out(its.value);
                const posTag = token.out(posIts);
                rawTokens.push({ word, tag: posTag, index });
                console.log(`Raw token ${index}:`, JSON.stringify(word), 'POS:', posTag);
            });
            
            // Second pass: reconstruct contractions and filter
            // Helper function to check if word contains apostrophe (ASCII, typographic, and other variants)
            // Using Unicode escape sequences to ensure proper matching:
            // U+0027 ('), U+0060 (`), U+2018 ('), U+2019 ('), U+201B (‛), U+02BC (ʼ)
            const apostropheRegex = /[\u0027\u0060\u2018\u2019\u201B\u02BC]/;
            const hasApostrophe = (w) => apostropheRegex.test(w);
            const isApostrophe = (w) => w.length === 1 && apostropheRegex.test(w);
            const normalizeApostrophe = (w) => w.replace(/[\u0027\u0060\u2018\u2019\u201B\u02BC]/g, "'"); // Convert all to ASCII
            
            const finalWords = [];
            const finalTags = [];
            let i = 0;
            while (i < rawTokens.length) {
                const token = rawTokens[i];
                let word = token.word;
                let tag = token.tag;
                
                // DEBUG: Check possessive-like tokens
                if (word.length <= 3 && /s$/i.test(word)) {
                    const char0 = word.charAt(0);
                    const char0Code = char0.charCodeAt(0);
                    console.log(`DEBUG possessive check: word="${word}", len=${word.length}, char0="${char0}", char0Code=${char0Code}, isApostrophe=${isApostrophe(char0)}`);
                }
                
                // Special case: standalone "'s" or "'s" (possessive) should be attached to the previous word
                // Check if it's a 2-character token: apostrophe + 's'
                if (word.length === 2 && isApostrophe(word.charAt(0)) && word.charAt(1).toLowerCase() === 's') {
                    console.log(`DEBUG: Found possessive token: "${word}" (length: ${word.length}, codes: ${Array.from(word).map(c => c.charCodeAt(0)).join(',')})`);
                    if (finalWords.length > 0) {
                        // Attach to previous word (e.g., "Trump" + "'s" -> "Trump's")
                        finalWords[finalWords.length - 1] += "'s";
                        console.log(`Attached possessive to previous word: ${finalWords[finalWords.length - 1]}`);
                        i++;
                        continue;
                    }
                }
                
                // Check if word already contains apostrophe (e.g., "don't" or "n't" or "'ll" came as one token)
                if (hasApostrophe(word)) {
                    // Normalize the apostrophe first
                    word = normalizeApostrophe(word);
                    
                    // Check if this is a contraction SUFFIX that should be attached to previous word
                    // Examples: "n't" (won't, can't), "'ll" (we'll), "'re" (we're), "'ve" (we've), "'d" (we'd), "'m" (I'm)
                    const contractionSuffixPattern = /^['']?(n['']?t|ll|re|ve|d|m)$/i;
                    if (contractionSuffixPattern.test(word) && finalWords.length > 0) {
                        // Handle "n't" specially - it might come as "n't" or just need normalization
                        let suffix = word;
                        if (/^n['']?t$/i.test(word)) {
                            suffix = "n't";
                        } else if (!word.startsWith("'")) {
                            suffix = "'" + word;
                        }
                        finalWords[finalWords.length - 1] += suffix;
                        
                        // Update the POS tag for contractions:
                        // - n't contractions (won't, can't, shouldn't) are auxiliary verbs with negation
                        // - 'll contractions (we'll, I'll) are auxiliary verbs (will)
                        // - 're contractions (we're, they're) are auxiliary verbs (are)
                        // - 've contractions (we've, they've) are auxiliary verbs (have)
                        // - 'd contractions (we'd, I'd) are auxiliary verbs (would/had)
                        // - 'm contractions (I'm) are auxiliary verbs (am)
                        if (/^n['']?t$/i.test(word) || /^['']?(ll|re|ve|d|m)$/i.test(word)) {
                            finalTags[finalTags.length - 1] = 'AUX'; // Auxiliary verb
                        }
                        
                        console.log(`Attached contraction suffix to previous word: ${finalWords[finalWords.length - 1]} (tag: ${finalTags[finalTags.length - 1]})`);
                        i++;
                        continue;
                    }
                    
                    // Otherwise, it's a word with apostrophe that stands on its own (e.g., "O'Brien")
                    console.log(`Word with apostrophe: ${word}`);
                    i++;
                }
                // Check if this is a contraction/possessive pattern: word + "'" or "'" + small word (s, d, ll, re, ve, t, m)
                // This handles cases like "artificial's", "don't", "we're", "I'm", etc.
                else if (i + 1 < rawTokens.length && isApostrophe(rawTokens[i + 1].word)) {
                    // Check if there's a following word that forms a contraction/possessive
                    if (i + 2 < rawTokens.length) {
                        const nextWord = rawTokens[i + 2].word;
                        // Check if next word is a contraction suffix (s for possessive, d, ll, re, ve, t, m for contractions)
                        if (/^(s|d|ll|re|ve|t|m)$/i.test(nextWord)) {
                            // Reconstruct contraction or possessive (e.g., "artificial's", "don't", "we're")
                            const suffix = nextWord.toLowerCase();
                    word = token.word + "'" + suffix;
                            tag = token.tag; // Keep the main word's POS tag (artificial stays ADJ, don stays VERB, etc.)
                            console.log(`Reconstructed contraction/possessive: ${word} (tag: ${tag})`);
                    i += 3; // Skip the apostrophe and the small word
                        } else {
                            // Apostrophe followed by something that's not a standard contraction
                            // Just word + apostrophe, no following contraction
                            word = token.word + "'";
                            tag = token.tag;
                            console.log(`Word with apostrophe (no standard contraction): ${word}`);
                            i += 2; // Skip the apostrophe
                        }
                    } else {
                        // Word + apostrophe at end of sentence/tokens
                        word = token.word + "'";
                        tag = token.tag;
                        console.log(`Word with trailing apostrophe: ${word}`);
                        i += 2; // Skip the apostrophe
                    }
                }
                // Check if "'" or "'" + word pattern (beginning of contraction like 'twas)
                else if (i + 1 < rawTokens.length && 
                    isApostrophe(token.word) &&
                    /^[a-z]+$/i.test(rawTokens[i + 1].word)) {
                    const nextWord = rawTokens[i + 1].word;
                    // Only merge if it's a common contraction prefix
                    if (/^(t|d|s|ll|re|ve|m)$/i.test(nextWord)) {
                        word = "'" + nextWord;
                        tag = rawTokens[i + 1].tag;
                        console.log(`Reconstructed leading contraction: ${word}`);
                        i += 2;
                    } else {
                        // Skip standalone apostrophe
                        console.log('Skipping standalone apostrophe (not standard contraction)');
                        i++;
                        continue;
                    }
                }
                else if (isApostrophe(token.word)) {
                    // Standalone apostrophe - might be possessive (editors') or just punctuation
                    // Check if there's a word BEFORE this apostrophe that we already processed
                    if (finalWords.length > 0) {
                        // Check if next token is NOT a possessive suffix
                        const isTrailingPossessive = !(i + 1 < rawTokens.length && /^s$/i.test(rawTokens[i + 1].word));
                        if (isTrailingPossessive) {
                            // This is likely a possessive apostrophe for plural (e.g., "editors'")
                            // Append it to the last word
                            const lastIndex = finalWords.length - 1;
                            finalWords[lastIndex] = finalWords[lastIndex] + "'";
                            console.log(`Appended possessive apostrophe to previous word: ${finalWords[lastIndex]}`);
                        } else {
                    console.log('Skipping standalone apostrophe');
                        }
                    } else {
                        console.log('Skipping standalone apostrophe at start');
                    }
                    i++;
                    continue;
                }
                // Check if this is a hyphenated word pattern: word + "-" + word
                // This handles cases like "low-budget", "AI-research", "editor-in-chief", etc.
                else if (i + 1 < rawTokens.length && rawTokens[i + 1].word === "-") {
                    // Check if there's a following word that forms a compound
                    if (i + 2 < rawTokens.length) {
                        const nextWord = rawTokens[i + 2].word;
                        // Check if next word looks like part of a compound (only letters, not punctuation)
                        if (/^[a-z]+$/i.test(nextWord) && nextWord.length > 0) {
                            // Reconstruct hyphenated word
                            word = token.word + "-" + nextWord;
                            tag = token.tag; // Keep the first word's POS tag
                            console.log(`Reconstructed hyphenated word: ${word} (tag: ${tag})`);
                            i += 3; // Skip the hyphen and the second word
                        } else {
                            // Hyphen followed by non-word character, just skip hyphen
                            console.log(`Word with trailing hyphen (no word follows): ${token.word}`);
                            i++;
                        }
                    } else {
                        // Word + hyphen at end of sentence/tokens
                        console.log(`Word with trailing hyphen (end of tokens): ${token.word}`);
                        i++;
                    }
                }
                else if (token.word === "-") {
                    // Skip standalone hyphens
                    console.log('Skipping standalone hyphen');
                    i++;
                    continue;
                }
                // Check if this is a CamelCase pattern: "Chat" + "GPT" -> "ChatGPT"
                // ONLY for specific known patterns (whitelist)
                else if (i + 1 < rawTokens.length) {
                    const nextToken = rawTokens[i + 1];
                    const currentWord = token.word;
                    const nextWord = nextToken.word;
                    
                    // Whitelist: Known CamelCase words that should be merged
                    const knownCamelCase = {
                        'chat': ['gpt'],
                        'linked': ['in'],
                        'you': ['tube'],
                        'face': ['book'],
                        'insta': ['gram'],
                        'snap': ['chat']
                    };
                    
                    const currentLower = currentWord.toLowerCase();
                    const nextLower = nextWord.toLowerCase();
                    
                    // Check whitelist ONLY for known CamelCase words like ChatGPT, LinkedIn, YouTube
                    if (knownCamelCase[currentLower] && knownCamelCase[currentLower].includes(nextLower)) {
                        word = currentWord + nextWord;
                        tag = token.tag;
                        console.log(`Reconstructed known CamelCase word: ${word} (tag: ${tag})`);
                        i += 2;
                    }
                    // Don't merge arbitrary words with abbreviations like AI, US, etc.
                    // This was causing "Books" + "AI" → "BooksAI" which is wrong
                    else {
                        console.log(`Keeping word: ${word}`);
                        i++;
                    }
                } else {
                    console.log(`Keeping word: ${word}`);
                    i++;
                }
                
                // Skip pure punctuation (but keep words with apostrophes)
                if (shouldSkipToken(word)) {
                    console.log(`Skipping punctuation: ${word}`);
                    continue;
                }
                
                finalWords.push(word);
                finalTags.push(tag);
            }
            
            console.log('Final words:', finalWords);
            console.log('Final tags:', finalTags);

            // If en-pos is loaded, use it to enhance the tags
            if (appState.enPosLoaded && finalWords.length > 0) {
                try {
                    const TagCtor = appState.enPosTaggerCtor || getEnPosTagCtor();
                    if (!TagCtor) {
                        appState.enPosLoaded = false;
                        throw new Error('en-pos Tag constructor not available');
                    }

                    const tagger = new TagCtor(finalWords.map(normalizeWordForEnPos));
                    if (typeof tagger.initial === 'function') tagger.initial();
                    if (typeof tagger.smooth === 'function') tagger.smooth();
                    const taggedWords = tagger.tags || [];
                    
                    console.log('en-pos input:', finalWords.map(normalizeWordForEnPos));
                    console.log('en-pos output tags:', taggedWords);

                    for (let i = 0; i < finalWords.length; i++) {
                        const word = finalWords[i];
                        const winkTag = finalTags[i];
                        const enPosTag = taggedWords[i] || '';

                        // For contractions (words with apostrophes like won't, we'll, can't, etc.)
                        // trust winkNLP's tag (usually AUX) over en-pos (which often returns JJ/ADJ)
                        const hasApostropheInWord = /['\u2019]/.test(word);
                        const isContraction = hasApostropheInWord && /^(won't|won't|we'll|we'll|can't|can't|shouldn't|shouldn't|wouldn't|wouldn't|couldn't|couldn't|didn't|didn't|doesn't|doesn't|don't|don't|hasn't|hasn't|haven't|haven't|hadn't|hadn't|isn't|isn't|aren't|aren't|wasn't|wasn't|weren't|weren't|it's|it's|he's|he's|she's|she's|that's|that's|there's|there's|what's|what's|who's|who's|i'm|i'm|you're|you're|they're|they're|we're|we're|i've|i've|you've|you've|they've|they've|we've|we've|i'd|i'd|you'd|you'd|he'd|he'd|she'd|she'd|they'd|they'd|we'd|we'd|i'll|i'll|you'll|you'll|he'll|he'll|she'll|she'll|they'll|they'll|we'll|we'll)$/i.test(word);
                        
                        let enhancedTag;
                        const enPosTagUpper = enPosTag.toUpperCase();
                        
                        if (isContraction && (winkTag === 'AUX' || winkTag === 'VERB')) {
                            // Keep winkNLP's tag for contractions
                            enhancedTag = normalizePosTag(winkTag);
                        }
                        // Trust winkNLP when it says NOUN but en-pos says verb/adjective
                        // This fixes common misclassifications like "parents" -> VBZ, "podcast" -> JJ
                        else if (winkTag === 'NOUN' && (enPosTagUpper.startsWith('VB') || enPosTagUpper.startsWith('JJ'))) {
                            enhancedTag = 'NOUN';
                            console.log(`Keeping winkNLP NOUN for "${word}" (en-pos said ${enPosTag})`);
                        }
                        // If winkNLP says PROPN but en-pos says JJ (adjective) or VB (verb),
                        // check if it's a known noun first (podcast, productivity, etc.)
                        // before trusting en-pos
                        else if (winkTag === 'PROPN' && (enPosTagUpper.startsWith('JJ') || enPosTagUpper.startsWith('VB'))) {
                            const wordLower = word.toLowerCase().replace(/[''`]/g, ''); // Remove apostrophes for checking
                            // Known nouns that are often misclassified as adjectives
                            const knownNouns = ['podcast', 'productivity', 'podcasts', 'audio', 'video', 'music', 'art', 'labor', 'author', 'parent', 'parents'];
                            
                            if (knownNouns.includes(wordLower)) {
                                // It's a known noun, use NOUN instead of ADJ
                                enhancedTag = 'NOUN';
                                console.log(`Using NOUN for known noun "${word}" (en-pos incorrectly said ${enPosTag})`);
                            } else {
                                // Trust en-pos for adjectives and verbs
                                enhancedTag = normalizePosTag(mapEnPosToOurFormat(enPosTag, winkTag));
                                console.log(`Trusting en-pos ${enPosTag} over winkNLP PROPN for "${word}"`);
                            }
                        }
                        // Trust winkNLP PROPN only when en-pos also says it's a proper noun (NNP/NNPS)
                        else if (winkTag === 'PROPN' && (enPosTagUpper === 'NNP' || enPosTagUpper === 'NNPS')) {
                            enhancedTag = 'PROPN';
                            console.log(`Keeping winkNLP PROPN for "${word}" (en-pos confirmed ${enPosTag})`);
                        }
                        // Trust winkNLP when it says AUX (auxiliary verb)
                        else if (winkTag === 'AUX' && !enPosTagUpper.startsWith('MD') && !enPosTagUpper.startsWith('VB')) {
                            enhancedTag = 'AUX';
                        }
                        else {
                            enhancedTag = normalizePosTag(mapEnPosToOurFormat(enPosTag, winkTag));
                        }
                        
                        words.push(word);
                        posTags.push(enhancedTag);
                    }
                } catch (e) {
                    console.error('Error in en-pos tagging, falling back to winkNLP:', e);
                    words.push(...finalWords);
                    posTags.push(...finalTags.map(normalizePosTag));
                }
            } else {
                // Fallback to just winkNLP tags
                words.push(...finalWords);
                posTags.push(...finalTags.map(normalizePosTag));
            }

            sentenceTexts.push(sentence.out(its.text));
        });

        return { words, posTags, stats: calculateStatistics(words, posTags, sentenceTexts) };
    }
    
    // Helper function to map en-pos tags to our format
    function mapEnPosToOurFormat(enPosTag, fallbackTag) {
        if (!enPosTag) return fallbackTag || 'X';
        
        const tagUpper = enPosTag.toUpperCase();
        
        // Map en-pos tags to our format
        // NNP and NNPS are proper nouns - keep as PROPN
        if (tagUpper === 'NNP' || tagUpper === 'NNPS') return 'PROPN';
        // NN and NNS are common nouns
        if (tagUpper.startsWith('NN')) return 'NOUN';
        // MD is modal verb (auxiliary)
        if (tagUpper === 'MD') return 'AUX';
        if (tagUpper.startsWith('VB')) return 'VERB';
        if (tagUpper.startsWith('JJ')) return 'ADJ';
        if (tagUpper.startsWith('RB')) return 'ADV';
        if (tagUpper.startsWith('PRP')) return 'PRON';
        if (tagUpper.startsWith('DT')) return 'DET';
        if (tagUpper.startsWith('IN')) return 'ADP';
        if (tagUpper.startsWith('CC')) return 'CONJ';
        if (tagUpper.startsWith('CD')) return 'NUM';
        if (tagUpper === 'TO' || tagUpper === 'RP') return 'PART';
        if (tagUpper === 'UH') return 'INTJ';
        
        return fallbackTag || 'X';
    }

    function normalizePosTag(tag) {
        const tagString = String(tag || '').trim();
        if (!tagString) return 'X';

        const tagUpper = tagString.toUpperCase();

        // Penn Treebank style (en-pos or other taggers)
        if (tagUpper.startsWith('NN')) return 'NOUN';
        if (tagUpper.startsWith('VB')) return 'VERB';
        if (tagUpper.startsWith('JJ')) return 'ADJ';
        if (tagUpper.startsWith('RB')) return 'ADV';
        if (tagUpper.startsWith('PRP')) return 'PRON';
        if (tagUpper.startsWith('DT')) return 'DET';
        if (tagUpper.startsWith('IN')) return 'ADP';
        if (tagUpper.startsWith('CC')) return 'CONJ';
        if (tagUpper.startsWith('CD')) return 'NUM';
        if (tagUpper === 'TO' || tagUpper === 'RP') return 'PART';

        // Universal/UD-ish tags (winkNLP/others)
        // Keep PROPN and AUX as separate categories (don't merge with NOUN/VERB)
        if (tagUpper === 'PROPN') return 'PROPN';
        if (tagUpper === 'NOUN') return 'NOUN';
        if (tagUpper === 'AUX') return 'AUX';
        if (tagUpper === 'VERB') return 'VERB';
        if (tagUpper === 'ADJ' || tagUpper === 'ADJECTIVE') return 'ADJ';
        if (tagUpper === 'ADV' || tagUpper === 'ADVERB') return 'ADV';
        if (tagUpper === 'PRON' || tagUpper === 'PRONOUN') return 'PRON';
        if (tagUpper === 'DET' || tagUpper === 'ART' || tagUpper === 'DETERMINER' || tagUpper === 'ARTICLE') return 'DET';
        if (tagUpper === 'ADP' || tagUpper === 'PREP' || tagUpper === 'PREPOSITION') return 'ADP';
        if (tagUpper === 'CONJ' || tagUpper === 'CCONJ' || tagUpper === 'SCONJ' || tagUpper === 'CONJUNCTION') return 'CONJ';
        if (tagUpper === 'INTJ') return 'INTJ';
        if (tagUpper === 'NUM' || tagUpper === 'NUMBER') return 'NUM';
        if (tagUpper === 'PART' || tagUpper === 'PARTICLE') return 'PART';
        if (tagUpper === 'PUNCT') return 'X';

        return 'X';
    }

    function shouldSkipToken(word) {
        const w = String(word || '').trim();
        if (!w) return true;
        // Allow words with letters, numbers, or apostrophes (it's, don't, etc.)
        // Also allow standalone apostrophes (all variants) so they can be merged
        // Using Unicode escape sequences for apostrophe variants
        return !/[A-Za-z0-9\u0027\u0060\u2018\u2019\u201B\u02BC]/.test(w);
    }

    function getWinkPosIts(its) {
        return (its && its.upos) ? its.upos : its.pos;
    }

    function normalizeWordForEnPos(word) {
        const w = String(word || '');
        if (!w) return w;
        // Preserve acronyms like USA, FBI, etc.
        if (w.toUpperCase() === w && /[A-Z]/.test(w)) return w;
        // Remove leading/trailing punctuation but keep internal apostrophes
        const cleaned = w.replace(/^[^\w']+|[^\w']+$/g, '');
        return cleaned.toLowerCase();
    }

    // Custom POS dictionary for words not recognized by NLP models
    function getCustomPOS(word) {
        const w = word.toLowerCase();
        
        // Known problematic words with their correct POS
        const customDict = {
            'illustration': 'NOUN',
            'artificial': 'ADJ', 
            'controversial': 'ADJ',
            'intelligence': 'NOUN',
            'technology': 'NOUN',
            'science': 'NOUN',
            'research': 'NOUN',
            'analysis': 'NOUN',
            'politics': 'NOUN',
            'economics': 'NOUN',
            'mathematics': 'NOUN',
            'philosophy': 'NOUN',
            'literature': 'NOUN',
            'history': 'NOUN',
            'geography': 'NOUN',
            'biology': 'NOUN',
            'chemistry': 'NOUN',
            'physics': 'NOUN',
            'psychology': 'NOUN',
            'sociology': 'NOUN',
            'anthropology': 'NOUN',
            'linguistics': 'NOUN'
        };
        
        if (customDict[w]) {
            console.log(`Custom POS for ${w}: ${customDict[w]}`);
            return customDict[w];
        }
        
        // Pattern-based POS detection
        if (w.endsWith('ial') || w.endsWith('ive') || w.endsWith('ous') || w.endsWith('ful') || w.endsWith('less')) {
            return 'ADJ';
        }
        if (w.endsWith('tion') || w.endsWith('sion') || w.endsWith('ment') || w.endsWith('ness') || w.endsWith('ity') || w.endsWith('er') || w.endsWith('or') || w.endsWith('ist') || w.endsWith('ism') || w.endsWith('ics') || w.endsWith('logy') || w.endsWith('graphy') || w.endsWith('phy') || w.endsWith('ry') || w.endsWith('ty')) {
            return 'NOUN';
        }
        if (w.endsWith('ly') && w.length > 3) {
            return 'ADV';
        }
        if (w.endsWith('ing') && w.length > 4) {
            return 'VERB';
        }
        if (w.endsWith('ed') && w.length > 3) {
            return 'VERB';
        }
        
        return null; // Unknown
    }

    // Post-processing for compound words and missed tokens
    function postProcessCompoundTokens(words, posTags, text) {
        const knownWords = [
            'illustration', 'artificial', 'controversial', 'intelligence', 'technology', 'science',
            'research', 'analysis', 'politics', 'economics', 'mathematics', 'philosophy', 
            'literature', 'history', 'geography', 'biology', 'chemistry', 'physics', 
            'psychology', 'sociology', 'anthropology', 'linguistics', 'engineering', 
            'medicine', 'computer', 'software', 'hardware', 'internet', 'digital', 
            'electronic', 'mechanical', 'electrical', 'chemical', 'industrial'
        ];
        const processedWords = [...words];
        const processedTags = [...posTags];
        
        // Check if any known words are missing from our analysis (case-insensitive)
        const foundWords = new Set(words.map(w => w.toLowerCase()));
        const missingWords = knownWords.filter(word => !foundWords.has(word.toLowerCase()));
        
        console.log('All words found:', Array.from(foundWords));
        console.log('Checking known words:', knownWords);
        console.log('Missing known words:', missingWords);
        
        if (missingWords.length > 0) {
            // Try to find these words in the original text (case-insensitive)
            missingWords.forEach(missingWord => {
                // Look for word boundaries with any case
                const regex = new RegExp(`\\b${missingWord}\\b`, 'gi');
                const matches = text.match(regex);
                
                console.log(`Searching for ${missingWord} with regex:`, regex);
                console.log(`Matches found:`, matches);
                
                if (matches && matches.length > 0) {
                    console.log(`Found ${missingWord} in text:`, matches);
                    
                    // Use custom POS dictionary
                    const customPOS = getCustomPOS(missingWord);
                    const posTag = customPOS || 'NOUN'; // Fallback to NOUN
                    
                    // Add the word with its POS tag (use the actual found word)
                    matches.forEach(match => {
                        if (!foundWords.has(match.toLowerCase())) {
                            processedWords.push(match);
                            processedTags.push(posTag);
                            console.log(`Added ${match} as ${posTag} (custom dictionary)`);
                        }
                    });
                }
            });
        }
        
        return { words: processedWords, posTags: processedTags };
    }
    function mergeApostrophes(words, tags) {
        console.log('=== Starting merge process ===');
        console.log('Input words:', words);
        console.log('Input tags:', tags);
        
        const mergedWords = [];
        const mergedTags = [];
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const tag = tags[i];
            
            console.log(`Processing word ${i}:`, JSON.stringify(word));
            
            if (word === "'" && mergedWords.length > 0) {
                // Merge apostrophe with previous word
                const prevIndex = mergedWords.length - 1;
                const prevWord = mergedWords[prevIndex];
                mergedWords[prevIndex] = prevWord + "'";
                console.log(`  Merged apostrophe with previous word: ${prevWord} → ${mergedWords[prevIndex]}`);
                // Keep the previous tag (word tag, not punctuation)
            } else {
                mergedWords.push(word);
                mergedTags.push(tag);
                console.log(`  Added word: ${word}`);
            }
        }
        
        console.log('After first pass:', mergedWords);
        
        // Now handle cases where apostrophes were merged but need proper contraction formation
        const finalWords = [];
        const finalTags = [];
        
        for (let i = 0; i < mergedWords.length; i++) {
            const word = mergedWords[i];
            const tag = mergedTags[i];
            
            console.log(`Processing contraction ${i}:`, JSON.stringify(word));
            
            // Check if this word ends with apostrophe and next word starts with s/d/ll/re
            if (word.endsWith("'") && i + 1 < mergedWords.length) {
                const nextWord = mergedWords[i + 1];
                const nextTag = mergedTags[i + 1];
                
                console.log(`  Word ends with ', next word: ${nextWord}`);
                
                // Common contractions: 's, 'd, 'll, 're, 've, 't
                if (/^(s|d|ll|re|ve|t)$/i.test(nextWord)) {
                    const contraction = word + nextWord.toLowerCase();
                    finalWords.push(contraction);
                    finalTags.push(tag); // Keep the main word's tag
                    console.log(`  Formed contraction: ${contraction}`);
                    i++; // Skip the next word since we merged it
                } else {
                    finalWords.push(word);
                    finalTags.push(tag);
                    console.log(`  No contraction match, keeping: ${word}`);
                }
            } else {
                finalWords.push(word);
                finalTags.push(tag);
                console.log(`  Added final word: ${word}`);
            }
        }
        
        console.log('Final result:', { words: finalWords, tags: finalTags });
        console.log('=== Merge process complete ===');
        
        return { words: finalWords, tags: finalTags };
    }

    // POS tagging using winkNLP only - NO FALLBACKS
    function analyzeWithWinkNLP(text) {
        if (!appState.winkNLPLoaded || !appState.winkNLPModel || !window.winkNLP) {
            throw new Error('winkNLP is not loaded');
        }

        try {
            const nlp = window.winkNLP(appState.winkNLPModel);
            const doc = nlp.readDoc(text);
            const its = nlp.its;
            const posIts = getWinkPosIts(its);
            
            const words = [];
            const posTags = [];
            const sentenceTexts = [];
            
            // Get sentences for context
            const sentences = doc.sentences();
            
            // Process all tokens
            sentences.each((sentence) => {
                const tokens = sentence.tokens();
                
                // Ensure tokens is a valid winkNLP tokens object
                if (!tokens || typeof tokens.each !== 'function') {
                    console.error('Invalid tokens object in analyzeWithWinkNLP:', tokens);
                    return; // Skip this sentence
                }
                
                tokens.each((token) => {
                    const word = token.out(its.value);
                    const posTag = token.out(posIts);

                    if (shouldSkipToken(word)) return;

                    const mappedTag = normalizePosTag(posTag);
                    
                    words.push(word);
                    posTags.push(mappedTag);
                });
                sentenceTexts.push(sentence.out(its.text));
            });
            
            // Calculate statistics
            const stats = calculateStatistics(words, posTags, sentenceTexts);
            
            // Post-process to handle compound words that might have been missed
            const postProcessed = postProcessCompoundTokens(words, posTags, text);
            console.log('Post-processed words:', postProcessed.words);
            console.log('Post-processed tags:', postProcessed.posTags);
            
            return { words: postProcessed.words, posTags: postProcessed.posTags, stats };
        } catch (error) {
            console.error('Error using winkNLP:', error);
            throw error;
        }
    }
    
    // Helper function to split text into sentences (used only for fallback, but kept for completeness)
    function splitIntoSentences(text) {
        const sentences = text.split(/([.!?]+[\s\n]+)/);
        const result = [];
        
        for (let i = 0; i < sentences.length; i += 2) {
            const sentence = sentences[i];
            const punctuation = sentences[i + 1] || '';
            const fullSentence = (sentence + punctuation).trim();
            if (fullSentence) {
                result.push(fullSentence);
            }
        }
        
        return result.filter(s => s.length > 0);
    }

    function calculateStatistics(words, posTags, sentences) {
        const stats = {
            totalWords: words.length,
            uniqueWords: new Set(words.map(w => w.toLowerCase())).size,
            posCounts: {},
            wordFrequency: {},
            words: words, // Store words in stats for use in displayUnsaidTab
            posTags: posTags, // Store posTags in stats for use in displayUnsaidTab
            wordPosMap: {},
            sentences: sentences || [],
            hapaxLegomena: [], // Words that appear only once
            readabilityIndex: 0,
            avgSentenceLength: 0,
            posHeatmap: [] // Array of POS tags by position in text
        };
        
        // Count POS tags
        posTags.forEach(tag => {
            stats.posCounts[tag] = (stats.posCounts[tag] || 0) + 1;
        });
        
        // Build sentence-word index map for context
        const sentenceWordMap = new Map();
        
        if (sentences && sentences.length > 0 && words.length > 0) {
            const wordVariants = new Map();
            
            words.forEach((word, index) => {
                const cleanWord = word.toLowerCase().replace(/[^\w']/g, '');
                if (cleanWord) {
                    if (!wordVariants.has(cleanWord)) {
                        wordVariants.set(cleanWord, new Set());
                    }
                    wordVariants.get(cleanWord).add(word);
                    const wordNoPunct = word.replace(/[^\w']/g, '');
                    if (wordNoPunct) {
                        wordVariants.get(cleanWord).add(wordNoPunct);
                    }
                }
            });
            
            sentences.forEach((sentence, sentenceIndex) => {
                // Use original sentence, preserving full text
                const originalSentence = sentence.trim();
                if (!originalSentence) return;
                
                // Split sentence into words with positions
                const wordsInSentence = originalSentence.match(/\S+/g) || [];
                
                // Check all word variants against the sentence
                wordVariants.forEach((variants, cleanWord) => {
                    // Find all positions of this word in the sentence
                    const positions = [];
                    wordsInSentence.forEach((wordInSentence, wordIndex) => {
                        const cleanWordInSentence = wordInSentence.toLowerCase().replace(/[^\w']/g, '');
                        for (const variant of variants) {
                            const cleanVariant = variant.toLowerCase().replace(/[^\w']/g, '');
                            if (cleanWordInSentence === cleanVariant || 
                                wordInSentence.toLowerCase() === variant.toLowerCase()) {
                                positions.push(wordIndex);
                                break;
                            }
                        }
                    });
                    
                    if (positions.length > 0) {
                        if (!sentenceWordMap.has(cleanWord)) {
                            sentenceWordMap.set(cleanWord, []);
                        }
                        const existing = sentenceWordMap.get(cleanWord);
                        
                        // For each occurrence, create context with surrounding words
                        positions.forEach(wordIndex => {
                            const contextWindow = 7; // Words before and after
                            const start = Math.max(0, wordIndex - contextWindow);
                            const end = Math.min(wordsInSentence.length, wordIndex + contextWindow + 1);
                            const contextWords = wordsInSentence.slice(start, end);
                            const contextText = contextWords.join(' ');
                            const wordPosition = wordIndex - start; // Position of target word in context
                            
                            // Check if this context is already added
                            const contextKey = `${sentenceIndex}-${wordIndex}`;
                            if (!existing.some(ctx => ctx.contextKey === contextKey)) {
                                existing.push({
                                    sentenceIndex,
                                    sentence: originalSentence,
                                    context: contextText,
                                    contextKey: contextKey,
                                    wordPosition: wordPosition,
                                    fullSentence: originalSentence
                                });
                            }
                        });
                    }
                });
            });
        }
        
        // Count word frequency and create word-POS map
        // Only count actual words (length > 1, contains letters)
        words.forEach((word, index) => {
            const cleanWord = word.toLowerCase().replace(/[^\w']/g, '');
            // Only count if it's a real word (has letters, length > 1, not just punctuation)
            if (cleanWord && cleanWord.length > 1 && /[a-z]/.test(cleanWord)) {
                stats.wordFrequency[cleanWord] = (stats.wordFrequency[cleanWord] || 0) + 1;
                
                if (!stats.wordPosMap[cleanWord]) {
                    stats.wordPosMap[cleanWord] = {
                        original: word,
                        tags: {},
                        totalCount: 0,
                        contexts: sentenceWordMap.get(cleanWord) || []
                    };
                }
                const tag = posTags[index] || 'X';
                stats.wordPosMap[cleanWord].tags[tag] = (stats.wordPosMap[cleanWord].tags[tag] || 0) + 1;
                stats.wordPosMap[cleanWord].totalCount++;
            }
        });
        
        // Calculate hapax legomena (words appearing only once)
        // Filter out very short words and common words
        Object.entries(stats.wordFrequency).forEach(([word, count]) => {
            if (count === 1 && word.length > 2) { // Only words longer than 2 characters
                stats.hapaxLegomena.push(word);
            }
        });
        
        // Calculate readability index (Flesch Reading Ease)
        if (sentences && sentences.length > 0 && words.length > 0) {
            const totalSentences = sentences.length;
            const totalWords = words.length;
            const totalSyllables = words.reduce((sum, word) => {
                const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
                if (!cleanWord) return sum;
                // Simple syllable count (approximation)
                const vowels = cleanWord.match(/[aeiouy]+/g) || [];
                let syllables = vowels.length;
                if (cleanWord.endsWith('e')) syllables--;
                if (syllables === 0) syllables = 1;
                return sum + syllables;
            }, 0);
            
            // Flesch Reading Ease formula
            const avgSentenceLength = totalWords / totalSentences;
            const avgSyllablesPerWord = totalSyllables / totalWords;
            stats.readabilityIndex = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
            stats.avgSentenceLength = avgSentenceLength;
        }
        
        // Build POS heatmap (array of POS tags by position)
        stats.posHeatmap = posTags.map(tag => tag);
        
        // Calculate Gaps metrics
        const fullText = (sentences || []).join(' ').toLowerCase();
        const allWordsLower = words.map(w => w.toLowerCase());
        
        // 1. Sensory Profile
        const sensoryWords = {
            sight: ['see', 'look', 'view', 'watch', 'observe', 'visible', 'bright', 'dark', 'color', 'image', 'picture', 'visual', 'appear', 'show', 'display', 'sight', 'eye', 'gaze', 'glance', 'stare'],
            sound: ['hear', 'listen', 'sound', 'noise', 'voice', 'whisper', 'shout', 'scream', 'loud', 'quiet', 'silent', 'murmur', 'echo', 'ring', 'buzz', 'hum', 'chatter', 'music', 'melody', 'rhythm'],
            touch: ['touch', 'feel', 'grasp', 'hold', 'grip', 'smooth', 'rough', 'soft', 'hard', 'warm', 'cold', 'hot', 'cool', 'texture', 'pressure', 'contact', 'tactile', 'solid', 'firm'],
            smell: ['smell', 'scent', 'odor', 'aroma', 'fragrance', 'perfume', 'stench', 'stink', 'foul', 'sweet', 'bitter', 'pungent', 'aromatic', 'fresh', 'musty', 'earthy', 'floral', 'spicy'],
            taste: ['taste', 'flavor', 'sweet', 'bitter', 'sour', 'salty', 'savory', 'delicious', 'bland', 'spicy', 'hot', 'mild', 'tangy', 'rich', 'bland']
        };
        
        stats.sensoryProfile = {};
        stats.sensoryWords = {}; // Store found words
        Object.keys(sensoryWords).forEach(sense => {
            let count = 0;
            const foundWords = [];
            sensoryWords[sense].forEach(word => {
                // Find actual occurrences in text (preserving original case)
                words.forEach((originalWord, idx) => {
                    const cleanOriginal = originalWord.toLowerCase().replace(/[^\w']/g, '');
                    if (cleanOriginal === word) {
                        foundWords.push(originalWord);
                        count++;
                    }
                });
            });
            stats.sensoryProfile[sense] = (count / sensoryWords[sense].length) * 100;
            stats.sensoryWords[sense] = [...new Set(foundWords)]; // Unique words
        });
        
        // 2. Confidence Gap (Absolutes vs Hedges)
        const absolutes = ['always', 'never', 'all', 'every', 'none', 'fact', 'certain', 'definite', 'exact', 'precise', 'absolute', 'complete', 'total', 'entire', 'sure', 'guaranteed', 'proven', 'confirmed', 'established'];
        const hedges = ['maybe', 'perhaps', 'possibly', 'probably', 'likely', 'seems', 'appears', 'suggests', 'indicates', 'might', 'could', 'may', 'somewhat', 'rather', 'quite', 'fairly', 'relatively', 'approximately', 'roughly', 'almost'];
        
        const foundAbsolutes = [];
        const foundHedges = [];
        let absolutesCount = 0;
        let hedgesCount = 0;
        words.forEach((originalWord, idx) => {
            const wordLower = originalWord.toLowerCase().replace(/[^\w']/g, '');
            if (absolutes.includes(wordLower)) {
                absolutesCount++;
                foundAbsolutes.push(originalWord);
            }
            if (hedges.includes(wordLower)) {
                hedgesCount++;
                foundHedges.push(originalWord);
            }
        });
        
        const totalConfidence = absolutesCount + hedgesCount || 1;
        stats.confidenceGap = {
            absolutes: (absolutesCount / totalConfidence) * 100,
            hedges: (hedgesCount / totalConfidence) * 100,
            index: absolutesCount / (absolutesCount + hedgesCount || 1),
            words: {
                absolutes: [...new Set(foundAbsolutes)],
                hedges: [...new Set(foundHedges)]
            }
        };
        
        // 3. Abstraction Level
        const concreteWords = ['president', 'table', 'dollar', 'car', 'house', 'person', 'book', 'phone', 'computer', 'chair', 'door', 'window', 'tree', 'dog', 'cat', 'city', 'street', 'building', 'food', 'water', 'money', 'hand', 'eye', 'face', 'body'];
        const abstractWords = ['efficiency', 'democracy', 'potential', 'concept', 'idea', 'theory', 'principle', 'notion', 'philosophy', 'ideology', 'freedom', 'justice', 'equality', 'liberty', 'rights', 'values', 'beliefs', 'emotions', 'feelings', 'thoughts', 'wisdom', 'knowledge', 'understanding', 'awareness', 'consciousness'];
        
        const foundConcrete = [];
        const foundAbstract = [];
        let concreteCount = 0;
        let abstractCount = 0;
        words.forEach((originalWord, idx) => {
            const wordLower = originalWord.toLowerCase().replace(/[^\w']/g, '');
            if (concreteWords.includes(wordLower)) {
                concreteCount++;
                foundConcrete.push(originalWord);
            }
            if (abstractWords.includes(wordLower)) {
                abstractCount++;
                foundAbstract.push(originalWord);
            }
        });
        
        const totalAbstraction = concreteCount + abstractCount;
        // Ratio: 0 = fully abstract (left), 1 = fully concrete (right)
        // If no words found, default to middle (0.5)
        let ratio = 0.5;
        if (totalAbstraction > 0) {
            ratio = concreteCount / totalAbstraction;
        }
        
        stats.abstractionLevel = {
            concrete: totalAbstraction > 0 ? (concreteCount / totalAbstraction) * 100 : 0,
            abstract: totalAbstraction > 0 ? (abstractCount / totalAbstraction) * 100 : 0,
            ratio: ratio,
            words: {
                concrete: [...new Set(foundConcrete)],
                abstract: [...new Set(foundAbstract)]
            }
        };
        
        // 4. Perspective Analysis (Subjective vs Objective)
        const personalPronouns = ['i', 'we', 'me', 'us', 'my', 'our', 'myself', 'ourselves'];
        const impersonal = ['it', 'they', 'them', 'their', 'people', 'one', 'someone', 'anyone', 'everyone', 'nobody'];
        
        const foundPersonal = [];
        const foundImpersonal = [];
        let personalCount = 0;
        let impersonalCount = 0;
        words.forEach((originalWord, idx) => {
            const wordLower = originalWord.toLowerCase().replace(/[^\w']/g, '');
            if (personalPronouns.includes(wordLower)) {
                personalCount++;
                foundPersonal.push(originalWord);
            }
            if (impersonal.includes(wordLower)) {
                impersonalCount++;
                foundImpersonal.push(originalWord);
            }
        });
        
        const totalPerspective = personalCount + impersonalCount || 1;
        stats.perspective = {
            subjective: (personalCount / totalPerspective) * 100,
            objective: (impersonalCount / totalPerspective) * 100,
            ratio: personalCount / (personalCount + impersonalCount || 1),
            words: {
                subjective: [...new Set(foundPersonal)],
                objective: [...new Set(foundImpersonal)]
            }
        };
        
        // 5. Temporal Focus
        // This is simplified - in real NLP we'd analyze verb tenses
        const pastWords = ['was', 'were', 'had', 'did', 'went', 'came', 'said', 'took', 'made', 'got', 'saw', 'knew', 'thought', 'felt', 'yesterday', 'ago', 'before', 'earlier', 'previously', 'once', 'past'];
        const presentWords = ['is', 'are', 'am', 'have', 'has', 'do', 'does', 'go', 'come', 'say', 'take', 'make', 'get', 'see', 'know', 'think', 'feel', 'now', 'today', 'currently', 'present', 'always'];
        const futureWords = ['will', 'would', 'shall', 'should', 'going', 'gonna', 'tomorrow', 'soon', 'later', 'future', 'next', 'eventually', 'eventually', 'predict', 'forecast', 'plan', 'expect', 'anticipate'];
        
        const foundPast = [];
        const foundPresent = [];
        const foundFuture = [];
        let pastCount = 0;
        let presentCount = 0;
        let futureCount = 0;
        words.forEach((originalWord, idx) => {
            const wordLower = originalWord.toLowerCase().replace(/[^\w']/g, '');
            if (pastWords.includes(wordLower)) {
                pastCount++;
                foundPast.push(originalWord);
            }
            if (presentWords.includes(wordLower)) {
                presentCount++;
                foundPresent.push(originalWord);
            }
            if (futureWords.includes(wordLower)) {
                futureCount++;
                foundFuture.push(originalWord);
            }
        });
        
        const totalTemporal = pastCount + presentCount + futureCount || 1;
        stats.temporalFocus = {
            past: (pastCount / totalTemporal) * 100,
            present: (presentCount / totalTemporal) * 100,
            future: (futureCount / totalTemporal) * 100,
            words: {
                past: [...new Set(foundPast)],
                present: [...new Set(foundPresent)],
                future: [...new Set(foundFuture)]
            }
        };
        
        // 6. Argumentation Logic
        const causalityWords = ['because', 'therefore', 'since', 'thus', 'hence', 'consequently', 'as', 'due', 'reason', 'cause', 'effect', 'result'];
        const contrastWords = ['however', 'but', 'despite', 'although', 'though', 'whereas', 'while', 'yet', 'nevertheless', 'nonetheless', 'instead', 'rather', 'contrary', 'opposite'];
        const additionWords = ['and', 'also', 'furthermore', 'moreover', 'additionally', 'plus', 'besides', 'likewise', 'similarly', 'further', 'again', 'too'];
        
        const foundCausality = [];
        const foundContrast = [];
        const foundAddition = [];
        let causalityCount = 0;
        let contrastCount = 0;
        let additionCount = 0;
        words.forEach((originalWord, idx) => {
            const wordLower = originalWord.toLowerCase().replace(/[^\w']/g, '');
            if (causalityWords.includes(wordLower)) {
                causalityCount++;
                foundCausality.push(originalWord);
            }
            if (contrastWords.includes(wordLower)) {
                contrastCount++;
                foundContrast.push(originalWord);
            }
            if (additionWords.includes(wordLower)) {
                additionCount++;
                foundAddition.push(originalWord);
            }
        });
        
        const totalArgumentation = causalityCount + contrastCount + additionCount || 1;
        stats.argumentation = {
            causality: (causalityCount / totalArgumentation) * 100,
            contrast: (contrastCount / totalArgumentation) * 100,
            addition: (additionCount / totalArgumentation) * 100,
            words: {
                causality: [...new Set(foundCausality)],
                contrast: [...new Set(foundContrast)],
                addition: [...new Set(foundAddition)]
            }
        };
        
        return stats;
    }

    function displayTaggedText(words, posTags) {
        const panel = document.getElementById('controlPanelPosTagger');
        const panelSelector = '#controlPanelPosTagger';
        
        // Create word map with tracking
        const wordMap = new Map();
        const wordUsageMap = new Map();
        
        // First pass: create map of all word occurrences
        // Store both with and without apostrophes for better matching
        console.log('=== Creating wordMap ===');
        console.log('Total words from NLP:', words.length);
        console.log('Sample words:', words.slice(0, 20));
        
        // Check for specific words we're looking for
        const targetWords = ['author', 'art', 'labor', 'music', 'topics'];
        const foundTargets = [];
        
        words.forEach((word, index) => {
            const clean = word.toLowerCase().replace(/[^\w']/g, '');
            if (clean) {
                // Check if this is one of our target words
                if (targetWords.includes(clean)) {
                    foundTargets.push({ word, clean, index, tag: posTags[index] });
                }
                
                // Store with apostrophe
                if (!wordMap.has(clean)) {
                    wordMap.set(clean, []);
                }
                wordMap.get(clean).push({
                    index: index,
                    tag: normalizePosTag(posTags[index] || 'X'),
                    original: word,
                    used: false
                });
                
                // Also store without apostrophe for matching flexibility
                const cleanNoApostrophe = clean.replace(/'/g, '');
                if (cleanNoApostrophe && cleanNoApostrophe !== clean) {
                    if (!wordMap.has(cleanNoApostrophe)) {
                        wordMap.set(cleanNoApostrophe, []);
                    }
                    wordMap.get(cleanNoApostrophe).push({
                        index: index,
                        tag: normalizePosTag(posTags[index] || 'X'),
                        original: word,
                        used: false
                    });
                }
                
                wordUsageMap.set(index, false);
            }
        });
        
        console.log('Target words found in NLP:', foundTargets);
        console.log('wordMap keys (sample):', Array.from(wordMap.keys()).slice(0, 30));
        console.log('wordMap has "author":', wordMap.has('author'));
        console.log('wordMap has "art":', wordMap.has('art'));
        console.log('wordMap has "labor":', wordMap.has('labor'));
        
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    const parent = node.parentNode;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    if (parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE') return NodeFilter.FILTER_REJECT;

                    if (parent.closest && parent.closest('.pos-tag-extension')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    if (panel && (panel.contains(parent) || parent.closest(panelSelector))) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );

        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue.trim() !== '') {
                textNodes.push(node);
            }
        }

        // Sequential index for matching
        let currentWordIndex = 0;
        
        textNodes.forEach(textNode => {
            const text = textNode.nodeValue;
            const tokens = text.split(/(\s+)/);
            const fragment = document.createDocumentFragment();
            
            // Ensure tokens is an array
            if (!Array.isArray(tokens)) {
                console.warn('tokens is not an array:', tokens);
                return;
            }
            
            tokens.forEach(token => {
                if (token.trim() === '' || /^\s+$/.test(token)) {
                    fragment.appendChild(document.createTextNode(token));
                    return;
                }
                
                // Preserve apostrophes in token cleaning
                const cleanToken = token.toLowerCase().replace(/[^\w']/g, '');
                
                if (!cleanToken) {
                    fragment.appendChild(document.createTextNode(token));
                    return;
                }
                
                // Debug logging for target words
                const isTargetWord = ['author', 'art', 'labor', 'music', 'topics'].includes(cleanToken);
                if (isTargetWord) {
                    console.log(`\n=== Matching target word: "${cleanToken}" (from token: "${token}") ===`);
                    console.log('Current word index:', currentWordIndex);
                    console.log('wordMap has this word:', wordMap.has(cleanToken));
                    if (wordMap.has(cleanToken)) {
                        console.log('wordMap entries:', wordMap.get(cleanToken));
                    }
                }
                
                let matchedTag = null;
                let foundMatch = false;
                
                // Strategy 1: Try sequential match first
                if (currentWordIndex < words.length) {
                    for (let offset = 0; offset < Math.min(10, words.length - currentWordIndex); offset++) {
                        const idx = currentWordIndex + offset;
                        if (idx < words.length && !wordUsageMap.get(idx)) {
                            const word = words[idx];
                            // Preserve apostrophes when cleaning word for comparison
                            const wordClean = word.toLowerCase().replace(/[^\w']/g, '');
                            
                            // Try exact match first
                            if (wordClean === cleanToken) {
                                matchedTag = posTags[idx] || 'X';
                                wordUsageMap.set(idx, true);

                                // Keep wordMap in sync to prevent reusing the same index later
                                if (wordMap.has(cleanToken)) {
                                    const possibleMatches = wordMap.get(cleanToken);
                                    const matchObj = possibleMatches.find(m => m.index === idx && !m.used);
                                    if (matchObj) matchObj.used = true;
                                }

                                foundMatch = true;
                                currentWordIndex = idx + 1;
                                break;
                            }
                            // Try match without apostrophes (for cases where apostrophe was added/removed)
                            const wordCleanNoApostrophe = wordClean.replace(/'/g, '');
                            const tokenCleanNoApostrophe = cleanToken.replace(/'/g, '');
                            if (wordCleanNoApostrophe && tokenCleanNoApostrophe && 
                                wordCleanNoApostrophe === tokenCleanNoApostrophe &&
                                (wordClean.includes("'") || cleanToken.includes("'"))) {
                                // Match found but with different apostrophe handling
                                matchedTag = posTags[idx] || 'X';
                                wordUsageMap.set(idx, true);

                                if (wordMap.has(cleanToken) || wordMap.has(wordCleanNoApostrophe)) {
                                    const mapKey = wordMap.has(cleanToken) ? cleanToken : wordCleanNoApostrophe;
                                    const possibleMatches = wordMap.get(mapKey);
                                    if (possibleMatches) {
                                        const matchObj = possibleMatches.find(m => m.index === idx && !m.used);
                                        if (matchObj) matchObj.used = true;
                                    }
                                }

                                foundMatch = true;
                                currentWordIndex = idx + 1;
                                break;
                            }
                        }
                    }
                }
                
                // Strategy 1.5: Try matching with wordMap using apostrophe variations
                if (!foundMatch) {
                    const tokenNoApostrophe = cleanToken.replace(/'/g, '');
                    if (tokenNoApostrophe && tokenNoApostrophe !== cleanToken) {
                        // Try to find match without apostrophe
                        if (wordMap.has(tokenNoApostrophe)) {
                            const possibleMatches = wordMap.get(tokenNoApostrophe);
                    for (const match of possibleMatches) {
                        if (!match.used) {
                            matchedTag = match.tag;
                            match.used = true;
                            foundMatch = true;
                            wordUsageMap.set(match.index, true);
                            
                            if (match.index >= currentWordIndex) {
                                currentWordIndex = match.index + 1;
                            }
                            break;
                                }
                            }
                        }
                    }
                }
                
                // Strategy 2: Search in word map (exact match)
                // This should find most words that were processed by NLP
                if (!foundMatch && wordMap.has(cleanToken)) {
                    const possibleMatches = wordMap.get(cleanToken);
                    
                    // Prefer matches that are close to currentWordIndex to maintain order
                    const sortedMatches = possibleMatches
                        .filter(m => !m.used)
                        .sort((a, b) => {
                            // Prefer matches ahead of current position
                            const aDist = a.index >= currentWordIndex ? a.index - currentWordIndex : Infinity;
                            const bDist = b.index >= currentWordIndex ? b.index - currentWordIndex : Infinity;
                            return aDist - bDist;
                        });
                    
                    if (sortedMatches.length > 0) {
                        const match = sortedMatches[0];
                        matchedTag = match.tag;
                        match.used = true;
                        foundMatch = true;
                        wordUsageMap.set(match.index, true);
                        
                        if (match.index >= currentWordIndex) {
                            currentWordIndex = match.index + 1;
                        }
                    }
                }

                // Strategy 3: If we couldn't find an unused match but the word exists in NLP output,
                // use the most frequent tag for this word.
                if (!foundMatch && wordMap.has(cleanToken)) {
                    const allMatches = wordMap.get(cleanToken);
                    if (allMatches && allMatches.length > 0) {
                        const tagCounts = new Map();
                        for (const m of allMatches) {
                            const t = normalizePosTag(m.tag);
                            tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
                        }

                        let bestTag = 'X';
                        let bestCount = -1;
                        for (const [t, c] of tagCounts.entries()) {
                            if (c > bestCount) {
                                bestTag = t;
                                bestCount = c;
                            }
                        }

                        matchedTag = bestTag;
                        foundMatch = true;
                    }
                }
                
                // Strategy 4: Try to find word in all words array with flexible matching
                // This helps with words that might have been processed differently by NLP
                // Search in a window around currentWordIndex to maintain order
                if (!foundMatch && cleanToken.length > 0) {
                    const searchWindow = 50; // Search in a window of 50 words ahead
                    const startIdx = Math.max(0, currentWordIndex);
                    const endIdx = Math.min(words.length, currentWordIndex + searchWindow);
                    
                    for (let idx = startIdx; idx < endIdx; idx++) {
                        if (wordUsageMap.get(idx)) continue; // Skip already used words
                        
                        const word = words[idx];
                        const wordClean = word.toLowerCase().replace(/[^\w']/g, '');
                        
                        // Try exact match
                        if (wordClean === cleanToken) {
                            matchedTag = posTags[idx] || 'X';
                            wordUsageMap.set(idx, true);
                            foundMatch = true;
                            
                            // Update wordMap if needed for future matches
                            if (!wordMap.has(cleanToken)) {
                                wordMap.set(cleanToken, []);
                            }
                            const existing = wordMap.get(cleanToken);
                            const existingEntry = existing.find(e => e.index === idx);
                            if (!existingEntry) {
                                wordMap.get(cleanToken).push({
                                    index: idx,
                                    tag: matchedTag,
                                    original: word,
                                    used: true
                                });
                            } else {
                                existingEntry.used = true;
                            }
                            
                            currentWordIndex = idx + 1;
                            break;
                        }
                    }
                }
                
                // Strategy 5: Fallback - use custom POS only for truly unknown words
                // This should be rare - most words should be found by NLP
                if (!foundMatch && cleanToken.length > 0) {
                    // Only use custom POS if word is not in wordMap at all
                    // This means NLP didn't process it, which is unusual
                    if (!wordMap.has(cleanToken)) {
                        const customPOS = getCustomPOS(cleanToken);
                        if (customPOS) {
                            matchedTag = customPOS;
                            foundMatch = true;
                            console.warn(`Word "${cleanToken}" not found in NLP output, using custom POS: ${customPOS}`);
                            
                            // Add to wordMap for future matches
                            wordMap.set(cleanToken, []);
                            wordMap.get(cleanToken).push({
                                index: -1, // Virtual index
                                tag: customPOS,
                                original: token,
                                used: true
                            });
                        }
                    }
                }
                
                // Debug logging for target words - check if match was found
                if (isTargetWord) {
                    console.log(`Match found: ${foundMatch}, tag: ${matchedTag}`);
                    if (!foundMatch) {
                        console.log('Word not found! Checking why...');
                        console.log('Searching in words array...');
                        const foundInWords = words.findIndex((w, idx) => {
                            const wClean = w.toLowerCase().replace(/[^\w']/g, '');
                            return wClean === cleanToken && !wordUsageMap.get(idx);
                        });
                        console.log('Found in words array at index:', foundInWords);
                        if (foundInWords >= 0) {
                            console.log('Word in array:', words[foundInWords], 'tag:', posTags[foundInWords]);
                        }
                    }
                }
                
                // Create tag element if we found a match
                if (foundMatch && matchedTag) {
                    const normalizedTag = normalizePosTag(matchedTag);
                    const tagInfo = CONFIG.POS_TAGS[normalizedTag] || CONFIG.POS_TAGS['X'];
                    const span = document.createElement('span');
                    span.className = `pos-tag-extension ${tagInfo.class}`;
                    span.setAttribute('data-pos', tagInfo.name);
                    span.textContent = token;
                    span.style.cssText = `
                        font-family: 'Schflooze', Arial, sans-serif !important;
                        font-size: inherit !important;
                        line-height: inherit !important;
                        display: inline !important;
                    `;
                    
                    fragment.appendChild(span);
                } else {
                    // Check if this is a word (not punctuation/whitespace)
                    // If it's a word that wasn't found, mark as UNKNOWN
                    const isWord = /^[A-Za-z][A-Za-z0-9'-]*$/.test(cleanToken) && cleanToken.length > 1;
                    
                    if (isWord) {
                        // This is an unrecognized word - mark as UNKNOWN
                        const tagInfo = CONFIG.POS_TAGS['UNKNOWN'];
                        const span = document.createElement('span');
                        span.className = `pos-tag-extension ${tagInfo.class}`;
                        span.setAttribute('data-pos', tagInfo.name);
                        span.textContent = token;
                        span.style.cssText = `
                            font-family: 'Schflooze', Arial, sans-serif !important;
                            font-size: inherit !important;
                            line-height: inherit !important;
                            display: inline !important;
                        `;
                        fragment.appendChild(span);
                        console.log(`Word "${token}" not found in NLP - marked as UNKNOWN`);
                    } else {
                        // If no match found and not a word, leave as plain text
                    fragment.appendChild(document.createTextNode(token));
                    }
                }
            });
            
            if (fragment.childNodes.length > 0) {
                textNode.parentNode.replaceChild(fragment, textNode);
            }
        });
    }

    function displayStatistics(stats) {
        const statsContainer = document.getElementById('statsContainerPosTagger');
        if (!statsContainer || !stats) return;
        
        const totalWords = stats.totalWords || 1;
        
        let html = '<div class="stats-pos-tagger">';
        
        html += `
            <div class="stat-item-pos-tagger">
                <span class="stat-label-pos-tagger">Total Words:</span>
                <span class="stat-value-pos-tagger">${stats.totalWords}</span>
            </div>
            <div class="stat-item-pos-tagger">
                <span class="stat-label-pos-tagger">Unique Words:</span>
                <span class="stat-value-pos-tagger">${stats.uniqueWords}</span>
            </div>
        `;
        
        // Add readability metrics with benchmarking
        if (stats.readabilityIndex) {
            const readabilityLevel = stats.readabilityIndex >= 90 ? 'Easy' :
                                   stats.readabilityIndex >= 80 ? 'Easy' :
                                   stats.readabilityIndex >= 70 ? 'Fairly Easy' :
                                   stats.readabilityIndex >= 60 ? 'Standard' :
                                   stats.readabilityIndex >= 50 ? 'Difficult' :
                                   stats.readabilityIndex >= 30 ? 'Difficult' : 'Difficult';
            
            // Benchmark scale: 0-30 (Very Difficult/Legal), 30-50 (Difficult), 50-60 (Standard), 60-70 (Fairly Easy), 70-80 (Easy), 80-100 (Very Easy/Hemingway)
            const benchmarkPosition = Math.max(0, Math.min(100, ((stats.readabilityIndex / 100) * 100)));
            const benchmarks = [
                { label: 'Legal Doc', value: 10 },
                { label: 'Academic', value: 30 },
                { label: 'Standard', value: 50 },
                { label: 'Newspaper', value: 60 },
                { label: 'Hemingway', value: 90 }
            ];
            
            html += `
                <div class="stat-item-pos-tagger" style="flex-direction: column; align-items: flex-start; gap: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; width: 100%; gap: 8px; box-sizing: border-box;">
                        <span class="stat-label-pos-tagger" style="flex-shrink: 1; min-width: 0;">Readability:</span>
                        <span class="stat-value-pos-tagger" style="text-align: right; white-space: nowrap; flex-shrink: 0; margin-left: auto;">${readabilityLevel} <span style="color: #94a3b8; font-weight: 400;">(${stats.readabilityIndex.toFixed(1)})</span></span>
                    </div>
                    <div style="width: 100%; position: relative; height: 50px; background: #f1f5f9; border-radius: 12px; overflow: visible;">
                        <div style="position: absolute; left: ${benchmarkPosition}%; top: 0; width: 3px; height: 24px; background: #3b82f6; z-index: 3; transform: translateX(-50%); border-radius: 2px;"></div>
                        ${benchmarks.map((bench, idx) => {
                            const benchPos = (bench.value / 100) * 100;
                            // Alternate label positions to avoid overlap
                            const labelTop = idx % 2 === 0 ? '28px' : '36px';
                            return `
                                <div style="position: absolute; left: ${benchPos}%; top: 0; width: 1px; height: 24px; background: rgba(203, 213, 225, 0.5); transform: translateX(-50%); z-index: 1;"></div>
                                <div style="position: absolute; left: ${benchPos}%; top: ${labelTop}; transform: translateX(-50%); font-size: 8px; color: #64748b; white-space: nowrap; z-index: 1; pointer-events: none; max-width: 60px; overflow: hidden; text-overflow: ellipsis;" title="${bench.label}">${bench.label}</div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
            
            // Avg Sentence Length benchmarking
            // Typical ranges: Children's books (5-8), Fiction (10-15), Non-fiction (15-20), Academic (20-25), Legal (25+)
            const sentenceBenchmarks = [
                { label: 'Children', value: 6 },
                { label: 'Fiction', value: 12 },
                { label: 'Non-fiction', value: 18 },
                { label: 'Academic', value: 22 },
                { label: 'Legal', value: 28 }
            ];
            const maxSentenceLength = 35;
            const sentencePosition = Math.max(0, Math.min(100, (stats.avgSentenceLength / maxSentenceLength) * 100));
            
            html += `
                <div class="stat-item-pos-tagger" style="flex-direction: column; align-items: flex-start; gap: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; width: 100%; gap: 8px; box-sizing: border-box;">
                        <span class="stat-label-pos-tagger" style="flex-shrink: 1; min-width: 0;">Sentence Length:</span>
                        <span class="stat-value-pos-tagger" style="text-align: right; white-space: nowrap; flex-shrink: 0; margin-left: auto;">${stats.avgSentenceLength.toFixed(1)} <span style="color: #94a3b8; font-weight: 400;">words</span></span>
                    </div>
                    <div style="width: 100%; position: relative; height: 50px; background: #f1f5f9; border-radius: 12px; overflow: visible;">
                        <div style="position: absolute; left: ${sentencePosition}%; top: 0; width: 3px; height: 24px; background: #3b82f6; z-index: 3; transform: translateX(-50%); border-radius: 2px;"></div>
                        ${sentenceBenchmarks.map((bench, idx) => {
                            const benchPos = (bench.value / maxSentenceLength) * 100;
                            // Alternate label positions to avoid overlap
                            const labelTop = idx % 2 === 0 ? '28px' : '36px';
                            return `
                                <div style="position: absolute; left: ${benchPos}%; top: 0; width: 1px; height: 24px; background: rgba(203, 213, 225, 0.5); transform: translateX(-50%); z-index: 1;"></div>
                                <div style="position: absolute; left: ${benchPos}%; top: ${labelTop}; transform: translateX(-50%); font-size: 8px; color: #64748b; white-space: nowrap; z-index: 1; pointer-events: none; max-width: 60px; overflow: hidden; text-overflow: ellipsis;" title="${bench.label}">${bench.label}</div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        // Hapax legomena removed from display per user request
        
        // Add POS heatmap (centered, no label)
        if (stats.posHeatmap && stats.posHeatmap.length > 0) {
            html += `
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(203, 213, 225, 0.3);">
                    <div id="posHeatmap" style="display: flex; height: 32px; border-radius: 6px; overflow: hidden; border: 2px solid rgba(203, 213, 225, 0.6); cursor: pointer; background: #f8fafc; margin: 0 auto; max-width: 100%;" title="Click to highlight POS tags in text"></div>
                </div>
            `;
        }
        
        // Add skeleton mode toggle
        html += `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(203, 213, 225, 0.3);">
                <button id="skeletonModeBtn" style="width: 100%; padding: 8px; background: #f1f5f9; border: 1px solid rgba(203, 213, 225, 0.5); border-radius: 6px; font-size: 13px; color: #1e293b; cursor: pointer; font-weight: 500;">Skeleton Mode: Off</button>
                <select id="skeletonPosFilter" style="width: 100%; margin-top: 8px; padding: 6px; border: 1px solid rgba(203, 213, 225, 0.5); border-radius: 6px; font-size: 12px; display: none;">
                    <option value="">Select POS to show...</option>
                </select>
            </div>
        `;
        
        Object.entries(CONFIG.POS_TAGS).forEach(([tag, { name, class: tagClass }]) => {
            if (tag.length <= 4 && tag === tag.toUpperCase()) {
                const count = stats.posCounts[tag] || 0;
                if (count > 0) {
                    const percentage = ((count / totalWords) * 100).toFixed(1);
                    const bgColor = getTagColor(tagClass);
                    const textColor = getTagTextColor(tagClass);
                    html += `
                        <div class="stat-item-pos-tagger">
                            <span class="stat-label-pos-tagger" style="display: flex; align-items: center; gap: 6px;">
                                <span style="display: inline-block; width: 12px; height: 12px; border-radius: 2px; background: ${bgColor}; border: 1px solid ${textColor};"></span>
                                ${name}:
                            </span>
                            <span class="stat-value-pos-tagger">${count} (${percentage}%)</span>
                        </div>
                    `;
                }
            }
        });
        
        html += '</div>';
        statsContainer.innerHTML = html;
        
        // Render POS heatmap
        if (stats.posHeatmap && stats.posHeatmap.length > 0) {
            renderPosHeatmap(stats.posHeatmap, stats);
        }
        
        // Setup skeleton mode
        setupSkeletonMode(stats);
        
        // Setup POS category highlighting
        setupPosHighlighting(stats);
        
        // Setup tabs
        setupTabs();
        
        // Display Gaps tab
        displayUnsaidTab(stats);
        
        // Show search panel and setup search functionality
        if (stats.wordPosMap && Object.keys(stats.wordPosMap).length > 0) {
            setupSearchPanel(stats);
        }
    }
    
    // Setup tab switching
    function setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn-unsaid');
        const tabContents = document.querySelectorAll('.tab-content-unsaid');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Update buttons
                tabButtons.forEach(btn => {
                    btn.classList.remove('active');
                    btn.style.background = 'transparent';
                    btn.style.border = '1px solid transparent';
                    btn.style.color = '#64748b';
                    btn.style.fontWeight = '500';
                    btn.style.boxShadow = 'none';
                });
                button.classList.add('active');
                button.style.background = 'white';
                button.style.border = '1px solid rgba(203, 213, 225, 0.3)';
                button.style.color = '#1e293b';
                button.style.fontWeight = '600';
                button.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                
                // Update content
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    content.style.display = 'none';
                });
                
                const targetContent = document.getElementById(`tabContent${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`);
                if (targetContent) {
                    targetContent.classList.add('active');
                    targetContent.style.display = 'block';
                }
            });
        });
    }
    
    // Semantic shadow mapping - words that circle around a central unspoken concept
    const SHADOW_CONCEPTS = {
        pain: ['hurt', 'ache', 'sore', 'uncomfortable', 'difficult', 'hard', 'struggle', 'suffer', 'endure', 'bear', 'tolerate', 'wound', 'injury', 'damage', 'break', 'crack', 'fracture'],
        love: ['care', 'affection', 'fondness', 'attachment', 'devotion', 'passion', 'desire', 'longing', 'yearning', 'cherish', 'adore', 'treasure', 'value', 'precious', 'dear', 'beloved'],
        death: ['end', 'finish', 'conclusion', 'final', 'last', 'gone', 'lost', 'missing', 'absent', 'departed', 'left', 'disappeared', 'vanished', 'faded', 'ceased', 'stopped'],
        fear: ['worry', 'concern', 'anxiety', 'nervous', 'uneasy', 'apprehensive', 'dread', 'terror', 'panic', 'alarm', 'danger', 'threat', 'risk', 'peril', 'hazard'],
        joy: ['happy', 'pleased', 'glad', 'delighted', 'cheerful', 'bright', 'light', 'radiant', 'glowing', 'smiling', 'laughing', 'celebrating', 'rejoicing', 'elated', 'ecstatic']
    };
    
    // Thematic categories for void analysis
    const THEMATIC_CATEGORIES = {
        sounds: ['sound', 'noise', 'voice', 'whisper', 'shout', 'scream', 'loud', 'quiet', 'silent', 'murmur', 'echo', 'ring', 'buzz', 'hum', 'chatter', 'music', 'melody', 'rhythm', 'beat', 'tone', 'pitch', 'volume', 'acoustic', 'audible', 'hear', 'listen', 'audible'],
        smells: ['smell', 'scent', 'odor', 'aroma', 'fragrance', 'perfume', 'stench', 'stink', 'foul', 'sweet', 'bitter', 'pungent', 'aromatic', 'fresh', 'musty', 'earthy', 'floral', 'spicy', 'fragrant', 'reek', 'whiff', 'sniff', 'inhale', 'nose'],
        emotions: ['feel', 'feeling', 'emotion', 'mood', 'sentiment', 'passion', 'anger', 'rage', 'fury', 'happiness', 'joy', 'sadness', 'sorrow', 'grief', 'fear', 'anxiety', 'worry', 'love', 'hate', 'disgust', 'surprise', 'shock', 'excitement', 'calm', 'peace', 'tension', 'relief'],
        logic: ['think', 'thought', 'reason', 'logic', 'rational', 'analysis', 'analyze', 'consider', 'contemplate', 'reflect', 'ponder', 'examine', 'study', 'investigate', 'conclude', 'deduce', 'infer', 'understand', 'comprehend', 'grasp', 'concept', 'idea', 'theory', 'principle', 'method', 'system', 'structure', 'pattern', 'order'],
        time: ['time', 'moment', 'instant', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year', 'past', 'present', 'future', 'before', 'after', 'during', 'while', 'when', 'then', 'now', 'soon', 'later', 'earlier', 'recent', 'ancient', 'temporary', 'permanent', 'duration', 'period', 'age', 'era', 'epoch', 'decade', 'century', 'yesterday', 'today', 'tomorrow', 'long', 'brief', 'quick', 'slow', 'fast', 'rapid', 'gradual', 'sudden', 'immediate']
    };
    
    function detectShadowConcept(text, words) {
        const textLower = text.toLowerCase();
        const wordsLower = words.map(w => w.toLowerCase());
        const conceptScores = {};
        
        Object.keys(SHADOW_CONCEPTS).forEach(concept => {
            let score = 0;
            const relatedWords = SHADOW_CONCEPTS[concept];
            
            // Check if related words appear but central concept doesn't
            const hasCentralWord = textLower.includes(concept) || wordsLower.includes(concept);
            if (hasCentralWord) return; // Skip if central word is present
            
            relatedWords.forEach(relatedWord => {
                if (wordsLower.includes(relatedWord) || textLower.includes(relatedWord)) {
                    score++;
                }
            });
            
            conceptScores[concept] = score;
        });
        
        // Find concept with highest score
        const sortedConcepts = Object.entries(conceptScores).sort((a, b) => b[1] - a[1]);
        return sortedConcepts.length > 0 && sortedConcepts[0][1] > 2 ? sortedConcepts[0][0] : null;
    }
    
    
    function displayUnsaidTab(stats) {
        const unsaidContainer = document.getElementById('unsaidContainer');
        if (!unsaidContainer || !stats) return;
        
        // Get words from stats (preferred) or appState (fallback)
        const words = stats.words || appState.words || [];
        const posTags = stats.posTags || appState.posTags || [];
        
        console.log('displayUnsaidTab: stats available:', !!stats, 'words count:', words.length, 'from stats:', !!stats.words);
        
        // Main container with same style as "Said" (stats-pos-tagger)
        let html = '<div class="stats-pos-tagger" style="display: flex; flex-direction: column; gap: 20px;">';
        
        // Unspoken Tags (Облако умолчаний) - в самом начале, без отдельной плашки
        html += `
            <div style="margin-bottom: 4px;">
                <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 8px;">Unspoken Tags</div>
                <div style="font-size: 11px; color: #64748b; margin-bottom: 10px;">Words that could be here but aren't</div>
                <div id="unspokenTags" style="
                    display: flex; 
                    flex-wrap: wrap; 
                    gap: 6px; 
                    line-height: 1.5; 
                    min-height: 40px; 
                    align-items: flex-start;
                    padding: 10px 0;
                ">
                    <span style="color: rgba(148, 163, 184, 0.5); font-size: 11px; font-style: italic;">Loading...</span>
                </div>
            </div>
        `;
        
        // Load unspoken words asynchronously using semantic embeddings
        // Only call if we have words
        if (words.length > 0 && stats) {
            calculateUnspokenWordsSemantic(stats, words).then(unspokenWords => {
                const container = document.getElementById('unspokenTags');
                
                if (container) {
                    if (unspokenWords && unspokenWords.length > 0) {
                        // Remove duplicates (case-insensitive) before displaying
                        const uniqueWords = [];
                        const seenWords = new Set();
                        for (const word of unspokenWords) {
                            const wordLower = word.toLowerCase();
                            if (!seenWords.has(wordLower)) {
                                seenWords.add(wordLower);
                                uniqueWords.push(word);
                            }
                        }
                        
                        if (uniqueWords.length > 0) {
                            container.innerHTML = uniqueWords.map(word => `
                                <span class="unspoken-word" style="
                                    color: #475569; 
                                    font-size: 11px; 
                                    font-weight: 500;
                                    padding: 5px 11px; 
                                    border-radius: 5px; 
                                    cursor: pointer; 
                                    transition: all 0.2s ease; 
                                    border: 1px solid rgba(148, 163, 184, 0.3);
                                    background: linear-gradient(135deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.95) 100%);
                                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8);
                                    letter-spacing: 0.01em;
                                    white-space: nowrap;
                                    display: inline-block;
                                ">${word}</span>
                            `).join('');
                            setupUnspokenWords();
                        } else {
                            container.innerHTML = '<span style="color: rgba(148, 163, 184, 0.5); font-size: 11px; font-style: italic;">No alternative words found</span>';
                        }
                    } else {
                        container.innerHTML = '<span style="color: rgba(148, 163, 184, 0.5); font-size: 11px; font-style: italic;">No alternative words found</span>';
                    }
                } else {
                    console.error('unspokenTags container not found');
                }
            }).catch(err => {
                console.error('Error loading unspoken words:', err);
                const container = document.getElementById('unspokenTags');
                if (container) {
                    container.innerHTML = '<span style="color: rgba(239, 68, 68, 0.7); font-size: 11px;">Error loading words</span>';
                }
            });
        } else {
            // Show message if no words available
            setTimeout(() => {
                const container = document.getElementById('unspokenTags');
                if (container) {
                    container.innerHTML = '<span style="color: rgba(148, 163, 184, 0.5); font-size: 11px; font-style: italic;">No words available for analysis</span>';
                }
            }, 100);
        }
        
        // 1. Sensory Profile
        if (stats.sensoryProfile) {
            const sensoryLabels = {
                sight: 'Sight',
                sound: 'Sound',
                touch: 'Touch',
                smell: 'Smell',
                taste: 'Taste'
            };
            
            html += `
                <div style="padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(203, 213, 225, 0.3);">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">Sensory Profile</div>
                    ${Object.entries(sensoryLabels).map(([key, label]) => {
                        const percentage = stats.sensoryProfile[key] || 0;
                        const foundWords = (stats.sensoryWords && stats.sensoryWords[key]) || [];
                        const uniqueId = `sensory-${key}`;
                        return `
                            <div style="margin-bottom: 10px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; cursor: pointer;" class="evidence-trigger" data-category="sensory-${key}">
                                    <span style="font-size: 11px; color: #64748b;">${label}</span>
                                    <span style="font-size: 11px; color: #475569; font-weight: 600;">${percentage.toFixed(1)}%</span>
                                </div>
                                <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                                    <div style="width: ${percentage}%; height: 100%; background: ${percentage > 10 ? '#64748b' : '#94a3b8'}; transition: width 0.3s;"></div>
                                </div>
                                <div id="evidence-${uniqueId}" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                                    <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Found words:</div>
                                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                        ${foundWords.length > 0 ? foundWords.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
        
        // 2. Confidence Gap
        if (stats.confidenceGap) {
            const { absolutes, hedges, index, words: confidenceWords } = stats.confidenceGap;
            const foundAbsolutes = (confidenceWords && confidenceWords.absolutes) || [];
            const foundHedges = (confidenceWords && confidenceWords.hedges) || [];
            html += `
                <div style="padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(203, 213, 225, 0.3);">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">Confidence Gap</div>
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <div style="flex: 1; height: 24px; background: #e2e8f0; border-radius: 4px; overflow: hidden; position: relative;">
                            <div style="position: absolute; left: 0; top: 0; width: ${absolutes}%; height: 100%; background: #3b82f6; transition: width 0.3s;"></div>
                            <div style="position: absolute; right: 0; top: 0; width: ${hedges}%; height: 100%; background: #94a3b8; transition: width 0.3s;"></div>
                        </div>
                        <div style="font-size: 11px; color: #475569; font-weight: 600; min-width: 50px; text-align: right;">${index.toFixed(2)}</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-bottom: 8px;">
                        <span class="evidence-trigger" data-category="confidence-absolutes" style="cursor: pointer; text-decoration: underline;">Absolutes</span>
                        <span class="evidence-trigger" data-category="confidence-hedges" style="cursor: pointer; text-decoration: underline;">Hedges</span>
                    </div>
                    <div id="evidence-confidence-absolutes" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Absolutes found:</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${foundAbsolutes.length > 0 ? foundAbsolutes.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                        </div>
                    </div>
                    <div id="evidence-confidence-hedges" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Hedges found:</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${foundHedges.length > 0 ? foundHedges.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 3. Abstraction Level
        if (stats.abstractionLevel) {
            const { concrete, abstract, ratio, words: abstractionWords } = stats.abstractionLevel;
            const foundConcrete = (abstractionWords && abstractionWords.concrete) || [];
            const foundAbstract = (abstractionWords && abstractionWords.abstract) || [];
            // Ratio: 0 = fully abstract, 1 = fully concrete
            // Position: 0% = abstract (left), 100% = concrete (right)
            const abstractionPosition = Math.max(5, Math.min(95, ratio * 100)); // Clamp between 5% and 95% to avoid edge overflow
            html += `
                <div style="padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(203, 213, 225, 0.3);">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">Abstraction Level</div>
                    <div style="position: relative; height: 50px; background: #f1f5f9; border-radius: 12px; padding: 0 8px; margin-bottom: 8px; box-sizing: border-box;">
                        <div style="position: absolute; left: ${abstractionPosition}%; top: 0; width: 3px; height: 24px; background: #3b82f6; z-index: 3; transform: translateX(-50%); border-radius: 2px;"></div>
                        <div class="evidence-trigger" data-category="abstraction-concrete" style="position: absolute; left: 8px; top: 28px; font-size: 9px; color: #64748b; white-space: nowrap; z-index: 1; cursor: pointer; text-decoration: underline;">Concrete</div>
                        <div class="evidence-trigger" data-category="abstraction-abstract" style="position: absolute; right: 8px; top: 28px; font-size: 9px; color: #64748b; white-space: nowrap; z-index: 1; text-align: right; cursor: pointer; text-decoration: underline;">Abstract</div>
                    </div>
                    <div style="font-size: 10px; color: #64748b; text-align: center; margin-bottom: 8px;">Grounding: ${(ratio * 100).toFixed(1)}%</div>
                    <div id="evidence-abstraction-concrete" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Concrete words found:</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${foundConcrete.length > 0 ? foundConcrete.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                        </div>
                    </div>
                    <div id="evidence-abstraction-abstract" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Abstract words found:</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${foundAbstract.length > 0 ? foundAbstract.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 4. Perspective Analysis
        if (stats.perspective) {
            const { subjective, objective, ratio, words: perspectiveWords } = stats.perspective;
            const foundSubjective = (perspectiveWords && perspectiveWords.subjective) || [];
            const foundObjective = (perspectiveWords && perspectiveWords.objective) || [];
            html += `
                <div style="padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(203, 213, 225, 0.3);">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">Perspective Analysis</div>
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <div style="flex: 1; height: 24px; background: #e2e8f0; border-radius: 4px; overflow: hidden; position: relative;">
                            <div style="position: absolute; left: 0; top: 0; width: ${subjective}%; height: 100%; background: #ec4899; transition: width 0.3s;"></div>
                            <div style="position: absolute; right: 0; top: 0; width: ${objective}%; height: 100%; background: #3b82f6; transition: width 0.3s;"></div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-bottom: 8px;">
                        <span class="evidence-trigger" data-category="perspective-subjective" style="cursor: pointer; text-decoration: underline;">Subjective</span>
                        <span class="evidence-trigger" data-category="perspective-objective" style="cursor: pointer; text-decoration: underline;">Objective</span>
                    </div>
                    <div id="evidence-perspective-subjective" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Subjective words found:</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${foundSubjective.length > 0 ? foundSubjective.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                        </div>
                    </div>
                    <div id="evidence-perspective-objective" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Objective words found:</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${foundObjective.length > 0 ? foundObjective.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 5. Temporal Focus
        if (stats.temporalFocus) {
            const { past, present, future, words: temporalWords } = stats.temporalFocus;
            const foundPast = (temporalWords && temporalWords.past) || [];
            const foundPresent = (temporalWords && temporalWords.present) || [];
            const foundFuture = (temporalWords && temporalWords.future) || [];
            html += `
                <div style="padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(203, 213, 225, 0.3);">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">Temporal Focus</div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div>
                            <div class="evidence-trigger" data-category="temporal-past" style="display: flex; justify-content: space-between; margin-bottom: 4px; cursor: pointer;">
                                <span style="font-size: 11px; color: #64748b; text-decoration: underline;">Past</span>
                                <span style="font-size: 11px; color: #475569; font-weight: 600;">${past.toFixed(1)}%</span>
                            </div>
                            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                                <div style="width: ${past}%; height: 100%; background: #8b5cf6; transition: width 0.3s;"></div>
                            </div>
                            <div id="evidence-temporal-past" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                                <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Past words found:</div>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${foundPast.length > 0 ? foundPast.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                                </div>
                            </div>
                        </div>
                        <div>
                            <div class="evidence-trigger" data-category="temporal-present" style="display: flex; justify-content: space-between; margin-bottom: 4px; cursor: pointer;">
                                <span style="font-size: 11px; color: #64748b; text-decoration: underline;">Present</span>
                                <span style="font-size: 11px; color: #475569; font-weight: 600;">${present.toFixed(1)}%</span>
                            </div>
                            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                                <div style="width: ${present}%; height: 100%; background: #3b82f6; transition: width 0.3s;"></div>
                            </div>
                            <div id="evidence-temporal-present" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                                <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Present words found:</div>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${foundPresent.length > 0 ? foundPresent.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                                </div>
                            </div>
                        </div>
                        <div>
                            <div class="evidence-trigger" data-category="temporal-future" style="display: flex; justify-content: space-between; margin-bottom: 4px; cursor: pointer;">
                                <span style="font-size: 11px; color: #64748b; text-decoration: underline;">Future</span>
                                <span style="font-size: 11px; color: #475569; font-weight: 600;">${future.toFixed(1)}%</span>
                            </div>
                            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                                <div style="width: ${future}%; height: 100%; background: #10b981; transition: width 0.3s;"></div>
                            </div>
                            <div id="evidence-temporal-future" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                                <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Future words found:</div>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${foundFuture.length > 0 ? foundFuture.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 6. Argumentation Logic
        if (stats.argumentation) {
            const { causality, contrast, addition, words: argumentationWords } = stats.argumentation;
            const foundCausality = (argumentationWords && argumentationWords.causality) || [];
            const foundContrast = (argumentationWords && argumentationWords.contrast) || [];
            const foundAddition = (argumentationWords && argumentationWords.addition) || [];
            html += `
                <div style="padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(203, 213, 225, 0.3);">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 12px;">Argumentation Logic</div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div>
                            <div class="evidence-trigger" data-category="argumentation-causality" style="display: flex; justify-content: space-between; margin-bottom: 4px; cursor: pointer;">
                                <span style="font-size: 11px; color: #64748b; text-decoration: underline;">Causality</span>
                                <span style="font-size: 11px; color: #475569; font-weight: 600;">${causality.toFixed(1)}%</span>
                            </div>
                            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                                <div style="width: ${causality}%; height: 100%; background: #dc2626; transition: width 0.3s;"></div>
                            </div>
                            <div id="evidence-argumentation-causality" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                                <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Causality words found:</div>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${foundCausality.length > 0 ? foundCausality.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                                </div>
                            </div>
                        </div>
                        <div>
                            <div class="evidence-trigger" data-category="argumentation-contrast" style="display: flex; justify-content: space-between; margin-bottom: 4px; cursor: pointer;">
                                <span style="font-size: 11px; color: #64748b; text-decoration: underline;">Contrast</span>
                                <span style="font-size: 11px; color: #475569; font-weight: 600;">${contrast.toFixed(1)}%</span>
                            </div>
                            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                                <div style="width: ${contrast}%; height: 100%; background: #f59e0b; transition: width 0.3s;"></div>
                            </div>
                            <div id="evidence-argumentation-contrast" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                                <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Contrast words found:</div>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${foundContrast.length > 0 ? foundContrast.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                                </div>
                            </div>
                        </div>
                        <div>
                            <div class="evidence-trigger" data-category="argumentation-addition" style="display: flex; justify-content: space-between; margin-bottom: 4px; cursor: pointer;">
                                <span style="font-size: 11px; color: #64748b; text-decoration: underline;">Addition</span>
                                <span style="font-size: 11px; color: #475569; font-weight: 600;">${addition.toFixed(1)}%</span>
                            </div>
                            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                                <div style="width: ${addition}%; height: 100%; background: #10b981; transition: width 0.3s;"></div>
                            </div>
                            <div id="evidence-argumentation-addition" style="display: none; margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 4px; font-size: 10px; color: #64748b;">
                                <div style="font-weight: 600; margin-bottom: 4px; color: #475569;">Addition words found:</div>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${foundAddition.length > 0 ? foundAddition.map(w => `<span style="padding: 2px 6px; background: white; border-radius: 3px;">${w}</span>`).join('') : '<span style="color: #94a3b8;">No words found</span>'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        html += '</div>'; // Close stats-pos-tagger container
        unsaidContainer.innerHTML = html;
        
        // Setup evidence context toggles
        setupEvidenceContext();
        
        // Setup unspoken words hover effect (after a small delay to ensure DOM is ready)
        setTimeout(() => {
            setupUnspokenWords();
        }, 100);
    }
    
    // Word embeddings cache
    let wordEmbeddings = null;
    let embeddingsLoading = false;
    
    // Load word embeddings from file
    async function loadWordEmbeddings() {
        if (wordEmbeddings) return wordEmbeddings;
        if (embeddingsLoading) {
            // Wait for current load to complete
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (wordEmbeddings) {
                        clearInterval(checkInterval);
                        resolve(wordEmbeddings);
                    }
                }, 100);
            });
        }
        
        embeddingsLoading = true;
        try {
            // Try to load embeddings from a JSON file
            // The file should be in the extension's directory and accessible via web_accessible_resources
            // Try root first, then dist/
            let url = chrome.runtime.getURL('embeddings.json');
            console.log('Loading embeddings from:', url);
            let response = await fetch(url);
            
            // If root path doesn't work, try dist/
            if (!response.ok) {
                console.log('Root path failed, trying dist/embeddings.json...');
                url = chrome.runtime.getURL('dist/embeddings.json');
                console.log('Loading embeddings from:', url);
                response = await fetch(url);
            }
            
            console.log('Response status:', response.status, response.ok);
            console.log('Response headers:', response.headers.get('content-type'));
            
            if (response.ok) {
                const text = await response.text();
                console.log('Response text preview (first 200 chars):', text.substring(0, 200));
                
                // Find the start of JSON (skip any leading text like "Downloading...")
                let jsonStart = text.indexOf('{');
                if (jsonStart === -1) {
                    console.error('No JSON found in response. First 200 chars:', text.substring(0, 200));
                    wordEmbeddings = {}; // Empty fallback
                } else {
                    // Extract JSON part (from first { to last })
                    const jsonText = text.substring(jsonStart);
                    // Find the last } to ensure we have complete JSON
                    const jsonEnd = jsonText.lastIndexOf('}');
                    if (jsonEnd === -1) {
                        console.error('Incomplete JSON in response');
                        wordEmbeddings = {}; // Empty fallback
                    } else {
                        const cleanJson = jsonText.substring(0, jsonEnd + 1);
                        try {
                            wordEmbeddings = JSON.parse(cleanJson);
                            console.log('Loaded word embeddings:', Object.keys(wordEmbeddings).length, 'words');
                        } catch (parseErr) {
                            console.error('JSON parse error:', parseErr);
                            console.error('JSON text around error (first 500 chars):', cleanJson.substring(0, 500));
                            wordEmbeddings = {}; // Empty fallback
                        }
                    }
                }
            } else {
                const errorText = await response.text();
                console.warn('Embeddings file not found (status:', response.status, '), response:', errorText.substring(0, 200));
                wordEmbeddings = {}; // Empty fallback
            }
        } catch (err) {
            console.warn('Error loading embeddings:', err);
            wordEmbeddings = {}; // Empty fallback
        } finally {
            embeddingsLoading = false;
        }
        
        return wordEmbeddings;
    }
    
    // Calculate cosine similarity between two vectors
    function cosineSimilarity(vec1, vec2) {
        if (vec1.length !== vec2.length) return 0;
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }
        
        if (norm1 === 0 || norm2 === 0) return 0;
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }
    
    // Calculate average vector (center of mass) for a set of words
    function calculateAverageVector(words, embeddings) {
        const vectors = [];
        words.forEach(word => {
            const embedding = embeddings[word];
            if (embedding && Array.isArray(embedding)) {
                vectors.push(embedding);
            }
        });
        
        if (vectors.length === 0) return null;
        
        // Calculate average
        const dim = vectors[0].length;
        const avgVector = new Array(dim).fill(0);
        
        vectors.forEach(vector => {
            for (let i = 0; i < dim; i++) {
                avgVector[i] += vector[i];
            }
        });
        
        // Normalize
        for (let i = 0; i < dim; i++) {
            avgVector[i] /= vectors.length;
        }
        
        return avgVector;
    }
    
    // Calculate context-specific gaps using local word embeddings
    async function calculateUnspokenWordsSemantic(stats, words) {
        if (!stats || !words || words.length === 0) {
            console.log('calculateUnspokenWordsSemantic: empty input');
            return [];
        }
        
        const allWordsLower = words.map(w => w.toLowerCase().replace(/[^\w']/g, ''));
        const textLower = words.join(' ').toLowerCase();
        // Get posTags from stats (preferred) or appState (fallback)
        const posTags = stats.posTags || appState.posTags || [];
        
        // Load embeddings
        const embeddings = await loadWordEmbeddings();
        if (!embeddings || Object.keys(embeddings).length === 0) {
            console.warn('No embeddings available, using fallback semantic maps');
            // Fallback to semantic maps if embeddings not loaded
            return calculateUnspokenWordsFallback(stats, words);
        }
        
        console.log('calculateUnspokenWordsSemantic: embeddings loaded, total words:', Object.keys(embeddings).length);
        
        // Find SPECIFIC key words - not just frequent, but contextually important
        // Use a TF-IDF-like approach: prefer words that are specific to this text
        const wordFreq = {};
        const nounFreq = {}; // Separate tracking for nouns
        const wordLengths = {}; // Track word lengths for specificity
        let wordsWithEmbeddings = 0;
        
        // Common English words that appear everywhere (low specificity)
        const commonEnglishWords = new Set([
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
            'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
            'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
            'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think',
            'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
            'significant', 'presented', 'association', 'eventually', 'represent', 'together', 'additionally', 'activities', 'introduced', 'frequently',
            'exclusively', 'permanent', 'dedicated', 'interview', 'necessary', 'practice', 'complete', 'presence', 'creation', 'statement',
            // Latest generic words
            'interests', 'traditional', 'eventually', 'ultimately', 'together', 'relations', 'originally', 'understand', 'americans',
            'encouraged', 'exclusively', 'publication', 'previously', 'traditionally', 'represent', 'personal', 'includes', 'internet',
            'previous', 'interest', 'traditional', 'eventually', 'ultimately', 'together', 'relations', 'originally', 'understand',
            'personal', 'includes', 'internet', 'previous', 'interest', 'publication', 'previously', 'traditionally', 'encouraged'
        ]);
        
        words.forEach((word, idx) => {
            const wordLower = word.toLowerCase().replace(/[^\w']/g, '');
            const posTag = posTags[idx] || '';
            
            // Only consider meaningful nouns and verbs (length > 4 for better specificity)
            if (wordLower.length > 4 && ['NOUN', 'VERB', 'PROPN'].includes(posTag)) {
                if (embeddings[wordLower] && !commonEnglishWords.has(wordLower)) {
                    wordFreq[wordLower] = (wordFreq[wordLower] || 0) + 1;
                    wordLengths[wordLower] = wordLower.length;
                    wordsWithEmbeddings++;
                    
                    // Prioritize nouns - give them extra weight
                    if (posTag === 'NOUN' || posTag === 'PROPN') {
                        nounFreq[wordLower] = (nounFreq[wordLower] || 0) + 3; // Nouns count triple
                    }
                }
            }
        });
        
        console.log('calculateUnspokenWordsSemantic: words with embeddings:', wordsWithEmbeddings, 'out of', words.length);
        
        // Calculate specificity score: frequency * length * noun_bonus
        // Longer, less common words are more specific to the context
        const specificityScores = {};
        Object.keys(wordFreq).forEach(word => {
            const freq = wordFreq[word];
            const length = wordLengths[word] || word.length;
            const nounBonus = nounFreq[word] ? 2 : 1;
            // Specificity = frequency * length^1.5 * noun_bonus
            // This favors longer, less common words that are nouns
            specificityScores[word] = freq * Math.pow(length, 1.5) * nounBonus;
        });
        
        // Get top 20 most SPECIFIC words (not just frequent)
        const topKeyWords = Object.entries(specificityScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([word]) => word);
        
        // Ensure we have at least 12 nouns in the key words
        const topNouns = Object.entries(nounFreq)
            .sort((a, b) => {
                // Sort by specificity, not just frequency
                const scoreA = specificityScores[a[0]] || 0;
                const scoreB = specificityScores[b[0]] || 0;
                return scoreB - scoreA;
            })
            .slice(0, 12)
            .map(([word]) => word);
        
        // Merge, ensuring nouns are included, but prioritize specificity
        const finalKeyWords = [...new Set([...topNouns, ...topKeyWords])].slice(0, 20);
        
        if (topKeyWords.length === 0) {
            console.log('calculateUnspokenWordsSemantic: no key words found, using fallback');
            return calculateUnspokenWordsFallback(stats, words);
        }
        
        console.log('calculateUnspokenWordsSemantic: calculating semantic center from:', finalKeyWords.slice(0, 10));
        
        // Instead of using average vector, use individual key words for better context
        // This finds words that are close to multiple key words simultaneously
        const keyWordVectors = [];
        finalKeyWords.forEach(word => {
            const vector = embeddings[word];
            if (vector && Array.isArray(vector)) {
                keyWordVectors.push({ word, vector });
            }
        });
        
        if (keyWordVectors.length === 0) {
            console.log('calculateUnspokenWordsSemantic: no key word vectors found, using fallback');
            return calculateUnspokenWordsFallback(stats, words);
        }
        
        // Also calculate average for fallback comparison
        const centerVector = calculateAverageVector(finalKeyWords, embeddings);
        
        // Common stop words and overly generic words to exclude
        const stopWords = new Set([
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
            'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
            'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
            'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think',
            'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
            'own', 'though', 'fact', 'put', 'instead', 'yet', 'making', 'both', 'move', 'same', 'without', 'also', 'make', 'any',
            // Generic abstract words to exclude
            'considering', 'particular', 'suggested', 'although', 'reason', 'immediately', 'opportunity', 'especially', 'important', 'something', 
            'attention', 'continues', 'certainly', 'referring', 'possible', 'probably', 'question', 'addition', 'anything', 'actually',
            'maybe', 'perhaps', 'likely', 'usually', 'generally', 'typically', 'often', 'sometimes', 'always', 'never', 'already', 'still', 'even', 'quite',
            'rather', 'very', 'really', 'much', 'more', 'most', 'less', 'least', 'many', 'few', 'several', 'various', 'different', 'similar', 'same',
            'another', 'other', 'others', 'each', 'every', 'all', 'both', 'either', 'neither', 'such', 'some', 'any', 'some', 'no', 'none',
            // More generic words from the current results
            'possibility', 'concerned', 'particularly', 'exception', 'american', 'continue', 'provided', 'consider', 'directly', 'intended',
            'bringing', 'supposed', 'country', 'however', 'whether', 'while', 'calls', 'state', 'where', 'based',
            // Common adverbs and conjunctions
            'however', 'whether', 'while', 'where', 'when', 'why', 'how', 'what', 'which', 'who', 'whom', 'whose',
            'therefore', 'moreover', 'furthermore', 'nevertheless', 'nonetheless', 'meanwhile', 'otherwise', 'besides',
            // Common verbs
            'continue', 'consider', 'provide', 'intend', 'bring', 'suppose', 'call', 'base', 'concern',
            // Common adjectives
            'concerned', 'intended', 'supposed', 'based', 'provided', 'particular', 'especially', 'directly',
            // Generic nouns
            'possibility', 'exception', 'country', 'state', 'question', 'addition', 'attention', 'opportunity',
            // More generic words from current results
            'establishment', 'specifically', 'continuing', 'critical', 'brought', 'example', 'united', 'states', 
            'called', 'public', 'international', 'organization', 'established', 'considered', 'discussion',
            // Common generic verbs
            'establish', 'consider', 'discuss', 'continue', 'bring', 'call', 'provide', 'create', 'develop',
            // Common generic adjectives
            'specific', 'critical', 'public', 'international', 'general', 'common', 'basic', 'simple', 'complex',
            // Common generic nouns
            'example', 'organization', 'establishment', 'discussion', 'situation', 'condition', 'circumstance',
            'process', 'system', 'method', 'approach', 'way', 'manner', 'means', 'method', 'technique',
            // Latest generic words from results
            'recently', 'throughout', 'according', 'following', 'community', 'continued', 'beginning', 'business',
            'included', 'instance', 'working', 'interested', 'returning', 'creating', 'possibly',
            // Common -ly adverbs (too general)
            'recently', 'possibly', 'probably', 'certainly', 'usually', 'generally', 'typically', 'normally',
            'basically', 'actually', 'really', 'simply', 'clearly', 'obviously', 'apparently', 'essentially',
            // Common -ing words (gerunds/participles - often too general)
            'following', 'working', 'creating', 'continuing', 'returning', 'including', 'considering',
            'beginning', 'ending', 'starting', 'stopping', 'moving', 'changing', 'developing', 'growing',
            // Common -ed words (past participles - often too general)
            'continued', 'included', 'established', 'considered', 'created', 'developed', 'changed',
            'moved', 'started', 'stopped', 'worked', 'returned', 'interested', 'concerned', 'involved',
            // Common abstract nouns ending in -tion/-sion
            'situation', 'condition', 'position', 'action', 'section', 'function', 'relation', 'question',
            'solution', 'option', 'portion', 'notion', 'motion', 'emotion', 'nation', 'station',
            // More generic words to exclude
            'interests', 'traditional', 'eventually', 'ultimately', 'together', 'relations', 'originally', 'understand',
            'americans', 'encouraged', 'exclusively', 'publication', 'previously', 'traditionally', 'represent',
            'personal', 'includes', 'internet', 'previous', 'interest', 'traditional', 'eventually', 'ultimately',
            'together', 'relations', 'originally', 'understand', 'personal', 'includes', 'internet', 'previous',
            // Common adjectives ending in -al
            'traditional', 'personal', 'general', 'local', 'national', 'international', 'social', 'political',
            'cultural', 'financial', 'commercial', 'professional', 'educational', 'medical', 'legal', 'official',
            // Common words ending in -ly (adverbs)
            'traditionally', 'eventually', 'ultimately', 'originally', 'previously', 'exclusively', 'personally',
            'generally', 'specifically', 'particularly', 'especially', 'usually', 'normally', 'typically', 'basically',
            // Common words ending in -ing
            'including', 'following', 'working', 'creating', 'developing', 'changing', 'moving', 'starting',
            'ending', 'beginning', 'continuing', 'returning', 'considering', 'understanding', 'representing',
            // Common words ending in -ed
            'encouraged', 'included', 'established', 'considered', 'created', 'developed', 'changed', 'moved',
            'started', 'stopped', 'worked', 'returned', 'interested', 'concerned', 'involved', 'presented',
            // Common abstract nouns
            'interests', 'interest', 'relations', 'relation', 'publication', 'association', 'organization',
            'participation', 'development', 'statement', 'presence', 'creation', 'practice', 'activities'
        ]);
        
        // Find closest words to center that are NOT in text
        // Prioritize NOUNS - they are more specific and concrete
        const candidates = [];
        const nounCandidates = []; // Separate list for nouns
        const textWordSet = new Set(allWordsLower);
        const keyWordSet = new Set(finalKeyWords);
        
        // Helper to check if word looks like a noun (ends with common noun suffixes)
        // Exclude common abstract/generic noun suffixes
        const isLikelyNoun = (word) => {
            if (word.length < 10) return false; // Require longer words for noun detection
            
            // Exclude common abstract noun suffixes that are too general
            const genericNounSuffixes = ['tion', 'sion', 'ness', 'ment', 'ity', 'ance', 'ence'];
            const hasGenericSuffix = genericNounSuffixes.some(suffix => word.endsWith(suffix));
            
            // Prefer more specific noun suffixes
            const specificNounSuffixes = ['ship', 'hood', 'dom', 'ism', 'ist', 'er', 'or', 'ian'];
            const hasSpecificSuffix = specificNounSuffixes.some(suffix => word.endsWith(suffix));
            
            // Exclude -ing words (often gerunds, too general)
            if (word.endsWith('ing')) return false;
            
            // Exclude -ed words (past participles, too general)
            if (word.endsWith('ed')) return false;
            
            // Exclude -ly words (adverbs, too general)
            if (word.endsWith('ly')) return false;
            
            // Prefer longer words or words with specific suffixes
            return (word.length >= 11 && !hasGenericSuffix) || hasSpecificSuffix || word.length >= 13;
        };
        
        let checked = 0;
        Object.entries(embeddings).forEach(([word, vector]) => {
            checked++;
            // Skip if word is in text or is a key word
            if (textWordSet.has(word) || keyWordSet.has(word)) return;
            
            // Skip stop words and overly generic words
            if (stopWords.has(word)) return;
            
            // Skip very short words (prefer longer, more specific words)
            if (word.length < 9) return; // Increased from 8 to 9 for more specificity
            
            // Skip words ending in -ly (adverbs - too general) - almost always exclude
            if (word.endsWith('ly')) return;
            
            // Skip words ending in -ing (gerunds/participles - often too general) - unless very long
            if (word.endsWith('ing') && word.length < 12) return;
            
            // Skip words ending in -ed (past participles - often too general) - unless very long
            if (word.endsWith('ed') && word.length < 11) return;
            
            // Skip words ending in -tion/-sion (abstract nouns - often too general) - unless very long
            if ((word.endsWith('tion') || word.endsWith('sion')) && word.length < 12) return;
            
            // Skip abstract/generic words that are too common
            if (word.length < 9 && ['thing', 'stuff', 'place', 'person', 'people', 'way', 'time', 'day', 'year', 'week', 'month', 'hour', 'minute', 'second', 'world', 'life', 'work', 'home', 'house', 'family', 'friend', 'group', 'team', 'company', 'business', 'school', 'hospital', 'office', 'store', 'shop', 'restaurant', 'hotel', 'car', 'bus', 'train', 'plane', 'book', 'movie', 'music', 'food', 'water', 'money', 'price', 'cost', 'value', 'example', 'situation', 'condition', 'circumstance', 'process', 'system', 'method', 'approach', 'manner', 'means', 'technique', 'community', 'instance', 'beginning'].includes(word)) return;
            
            // Calculate similarity to each CONTEXT-SPECIFIC key word
            // Also calculate similarity to PAIRS of key words (more contextual)
            const similarities = keyWordVectors.map(({ word: keyWord, vector: keyVector }) => ({
                keyWord,
                similarity: cosineSimilarity(keyVector, vector)
            }));
            
            // Calculate similarity to PAIRS of key words (more contextual than single words)
            // Words close to pairs of key words are more specific to the text's context
            const pairSimilarities = [];
            for (let i = 0; i < keyWordVectors.length; i++) {
                for (let j = i + 1; j < keyWordVectors.length; j++) {
                    const pairVector1 = keyWordVectors[i].vector;
                    const pairVector2 = keyWordVectors[j].vector;
                    // Average vector of the pair
                    const pairVector = pairVector1.map((v, idx) => (v + pairVector2[idx]) / 2);
                    const pairSimilarity = cosineSimilarity(pairVector, vector);
                    if (pairSimilarity > 0.4) { // Only consider meaningful pairs
                        pairSimilarities.push({
                            pair: [keyWordVectors[i].word, keyWordVectors[j].word],
                            similarity: pairSimilarity
                        });
                    }
                }
            }
            
            // Sort pair similarities
            pairSimilarities.sort((a, b) => b.similarity - a.similarity);
            
            // Find words in the INTERSECTION of semantic spaces of multiple key words
            // Check how many CONTEXT-SPECIFIC key words this word is close to
            // STRICTER: Require higher similarity thresholds
            const closeKeyWords = similarities.filter(s => s.similarity > 0.5).length;
            const veryCloseKeyWords = similarities.filter(s => s.similarity > 0.6).length;
            const extremelyCloseKeyWords = similarities.filter(s => s.similarity > 0.7).length;
            
            // Check how many KEY WORD PAIRS this word is close to (more contextual)
            // STRICTER: Require higher similarity for pairs
            const closePairs = pairSimilarities.filter(p => p.similarity > 0.55).length;
            const veryClosePairs = pairSimilarities.filter(p => p.similarity > 0.65).length;
            
            // Use the average of top 3 similarities to key words
            const topSimilarities = similarities.slice(0, 3).map(s => s.similarity);
            const avgTopSimilarity = topSimilarities.reduce((sum, s) => sum + s, 0) / topSimilarities.length;
            
            // Use the average of top 3 similarities to key word PAIRS (more contextual)
            const topPairSimilarities = pairSimilarities.slice(0, 3).map(p => p.similarity);
            const avgTopPairSimilarity = topPairSimilarities.length > 0 
                ? topPairSimilarities.reduce((sum, s) => sum + s, 0) / topPairSimilarities.length 
                : 0;
            
            // Calculate "intersection score" - how well the word fits in the semantic intersection
            // Weight pair similarities more heavily (they're more contextual)
            // STRICTER: Use higher thresholds
            const intersectionScore = similarities
                .filter(s => s.similarity > 0.5)
                .reduce((sum, s) => sum + Math.pow(s.similarity, 2), 0) / Math.max(closeKeyWords, 1);
            
            const pairIntersectionScore = pairSimilarities
                .filter(p => p.similarity > 0.55)
                .reduce((sum, p) => sum + Math.pow(p.similarity, 2), 0) / Math.max(closePairs, 1);
            
            // Combined intersection score (pairs weighted 60%, single words 40%)
            const combinedIntersectionScore = pairIntersectionScore * 0.6 + intersectionScore * 0.4;
            
            // Higher threshold for more specific matches
            // Nouns get a bonus and lower threshold
            const isNoun = isLikelyNoun(word);
            const nounBonus = isNoun ? 0.1 : 0;
            const lengthBonus = Math.min(word.length / 15, 0.1);
            
            // Strong bonus for being close to KEY WORD PAIRS (more contextual)
            const pairBonus = Math.min(closePairs / 2, 0.25);
            const veryClosePairBonus = veryClosePairs * 0.15;
            
            // Bonus for being in the intersection of multiple SPECIFIC key words
            const multiKeyBonus = Math.min(closeKeyWords / 2, 0.2);
            const veryCloseBonus = veryCloseKeyWords * 0.15;
            const extremelyCloseBonus = extremelyCloseKeyWords * 0.2;
            
            // Use combined intersection score as primary metric (pairs are more contextual)
            const centerSimilarity = centerVector ? cosineSimilarity(centerVector, vector) : 0;
            const bestSimilarity = Math.max(combinedIntersectionScore, avgTopPairSimilarity, avgTopSimilarity, centerSimilarity);
            
            const adjustedSimilarity = bestSimilarity + nounBonus + lengthBonus + pairBonus + veryClosePairBonus + multiKeyBonus + veryCloseBonus + extremelyCloseBonus;
            
            // Minimum similarity threshold: require closeness to key word PAIRS (more contextual)
            const minKeySimilarity = Math.max(...similarities.map(s => s.similarity));
            const minPairSimilarity = pairSimilarities.length > 0 ? Math.max(...pairSimilarities.map(p => p.similarity)) : 0;
            const minThreshold = isNoun ? 0.5 : 0.6; // Raised thresholds
            
            // Word must be close to at least one KEY WORD PAIR (more contextual) OR very close to multiple key words
            // Also require it to be close to at least 3 key words OR 2 key word pairs
            // STRICTER: Require BOTH pair matches AND key word matches for better context
            const hasStrongPairMatch = minPairSimilarity > 0.6 && closePairs >= 3;
            const hasStrongKeyMatch = minKeySimilarity > 0.6 && closeKeyWords >= 4;
            const hasContextualMatch = hasStrongPairMatch || (hasStrongKeyMatch && closePairs >= 2);
            
            if (hasContextualMatch && adjustedSimilarity > minThreshold) {
                const candidate = { 
                    word, 
                    similarity: adjustedSimilarity, 
                    length: word.length, 
                    isNoun,
                    keyWordMatches: closeKeyWords,
                    veryCloseMatches: veryCloseKeyWords,
                    extremelyCloseMatches: extremelyCloseKeyWords,
                    pairMatches: closePairs,
                    veryClosePairs: veryClosePairs,
                    maxKeySimilarity: minKeySimilarity,
                    maxPairSimilarity: minPairSimilarity,
                    avgTopSimilarity: avgTopSimilarity,
                    avgTopPairSimilarity: avgTopPairSimilarity,
                    intersectionScore: combinedIntersectionScore
                };
                if (isNoun) {
                    nounCandidates.push(candidate);
                } else {
                    candidates.push(candidate);
                }
            }
        });
        
        console.log('calculateUnspokenWordsSemantic: checked', checked, 'words, found', candidates.length, 'regular candidates and', nounCandidates.length, 'noun candidates');
        
        // Sort both lists - prioritize words close to KEY WORD PAIRS (more contextual)
        nounCandidates.sort((a, b) => {
            // Primary: average similarity to key word PAIRS (most contextual - pairs define context better)
            if (Math.abs(b.avgTopPairSimilarity - a.avgTopPairSimilarity) > 0.05) {
                return b.avgTopPairSimilarity - a.avgTopPairSimilarity;
            }
            // Secondary: number of very close PAIR matches (most contextual)
            if (b.veryClosePairs !== a.veryClosePairs) {
                return b.veryClosePairs - a.veryClosePairs;
            }
            // Tertiary: number of close PAIR matches
            if (b.pairMatches !== a.pairMatches) {
                return b.pairMatches - a.pairMatches;
            }
            // Quaternary: max similarity to any key word PAIR
            if (Math.abs(b.maxPairSimilarity - a.maxPairSimilarity) > 0.05) {
                return b.maxPairSimilarity - a.maxPairSimilarity;
            }
            // Quinary: intersection score (how well word fits in semantic intersection)
            if (Math.abs(b.intersectionScore - a.intersectionScore) > 0.05) {
                return b.intersectionScore - a.intersectionScore;
            }
            // Senary: number of EXTREMELY close key word matches
            if (b.extremelyCloseMatches !== a.extremelyCloseMatches) {
                return b.extremelyCloseMatches - a.extremelyCloseMatches;
            }
            // Septenary: number of VERY close key word matches
            if (b.veryCloseMatches !== a.veryCloseMatches) {
                return b.veryCloseMatches - a.veryCloseMatches;
            }
            // Octonary: number of key word matches
            if (b.keyWordMatches !== a.keyWordMatches) {
                return b.keyWordMatches - a.keyWordMatches;
            }
            // Nonary: average of top similarities to key words
            if (Math.abs(b.avgTopSimilarity - a.avgTopSimilarity) > 0.05) {
                return b.avgTopSimilarity - a.avgTopSimilarity;
            }
            // Decenary: max similarity to any key word
            if (Math.abs(b.maxKeySimilarity - a.maxKeySimilarity) > 0.05) {
                return b.maxKeySimilarity - a.maxKeySimilarity;
            }
            // Undecenary: overall adjusted similarity
            if (Math.abs(b.similarity - a.similarity) > 0.05) {
                return b.similarity - a.similarity;
            }
            // Duodecenary: length (prefer longer words)
            return b.length - a.length;
        });
        
        candidates.sort((a, b) => {
            // Primary: average similarity to key word PAIRS (most contextual - pairs define context better)
            if (Math.abs(b.avgTopPairSimilarity - a.avgTopPairSimilarity) > 0.05) {
                return b.avgTopPairSimilarity - a.avgTopPairSimilarity;
            }
            // Secondary: number of very close PAIR matches (most contextual)
            if (b.veryClosePairs !== a.veryClosePairs) {
                return b.veryClosePairs - a.veryClosePairs;
            }
            // Tertiary: number of close PAIR matches
            if (b.pairMatches !== a.pairMatches) {
                return b.pairMatches - a.pairMatches;
            }
            // Quaternary: max similarity to any key word PAIR
            if (Math.abs(b.maxPairSimilarity - a.maxPairSimilarity) > 0.05) {
                return b.maxPairSimilarity - a.maxPairSimilarity;
            }
            // Quinary: intersection score (how well word fits in semantic intersection)
            if (Math.abs(b.intersectionScore - a.intersectionScore) > 0.05) {
                return b.intersectionScore - a.intersectionScore;
            }
            // Senary: number of EXTREMELY close key word matches
            if (b.extremelyCloseMatches !== a.extremelyCloseMatches) {
                return b.extremelyCloseMatches - a.extremelyCloseMatches;
            }
            // Septenary: number of VERY close key word matches
            if (b.veryCloseMatches !== a.veryCloseMatches) {
                return b.veryCloseMatches - a.veryCloseMatches;
            }
            // Octonary: number of key word matches
            if (b.keyWordMatches !== a.keyWordMatches) {
                return b.keyWordMatches - a.keyWordMatches;
            }
            // Nonary: average of top similarities to key words
            if (Math.abs(b.avgTopSimilarity - a.avgTopSimilarity) > 0.05) {
                return b.avgTopSimilarity - a.avgTopSimilarity;
            }
            // Decenary: max similarity to any key word
            if (Math.abs(b.maxKeySimilarity - a.maxKeySimilarity) > 0.05) {
                return b.maxKeySimilarity - a.maxKeySimilarity;
            }
            // Undecenary: overall adjusted similarity
            if (Math.abs(b.similarity - a.similarity) > 0.05) {
                return b.similarity - a.similarity;
            }
            // Duodecenary: length (prefer longer words)
            return b.length - a.length;
        });
        
        // Prioritize nouns: take 15 nouns first, then 5 other words
        // But prefer words that match multiple key words
        const allCandidates = [
            ...nounCandidates.slice(0, 15).map(item => item.word),
            ...candidates.slice(0, 5).map(item => item.word)
        ];
        
        // Remove duplicates (case-insensitive)
        const seen = new Set();
        const result = [];
        for (const word of allCandidates) {
            const wordLower = word.toLowerCase();
            if (!seen.has(wordLower)) {
                seen.add(wordLower);
                result.push(word);
                if (result.length >= 20) break;
            }
        }
        
        console.log('calculateUnspokenWordsSemantic: found semantic gaps:', result.length, result.slice(0, 10));
        
        // If no results, use fallback
        if (result.length === 0) {
            console.log('calculateUnspokenWordsSemantic: no results, using fallback');
            return calculateUnspokenWordsFallback(stats, words);
        }
        
        return result;
    }
    
    // Fallback function using semantic maps
    function calculateUnspokenWordsFallback(stats, words) {
        if (!stats || !words || words.length === 0) return [];
        
        const allWordsLower = words.map(w => w.toLowerCase().replace(/[^\w']/g, ''));
        const posTags = appState.posTags || [];
        
        // Simple semantic maps for common words
        const semanticMaps = {
            'trump': ['president', 'administration', 'policy', 'election', 'campaign', 'government', 'executive', 'presidency'],
            'president': ['leader', 'executive', 'administration', 'office', 'authority', 'governance', 'leadership'],
            'court': ['judiciary', 'legal', 'judgment', 'ruling', 'law', 'justice', 'trial', 'lawsuit'],
            'law': ['legislation', 'statute', 'regulation', 'rule', 'legal', 'jurisdiction', 'constitution'],
            'decision': ['choice', 'judgment', 'resolution', 'determination', 'verdict', 'conclusion', 'outcome'],
            'government': ['administration', 'authority', 'governance', 'state', 'regime', 'institution', 'bureaucracy'],
            'policy': ['strategy', 'approach', 'plan', 'method', 'framework', 'guideline', 'principle'],
            'political': ['governmental', 'civic', 'democratic', 'electoral', 'partisan', 'institutional'],
            'think': ['contemplate', 'ponder', 'reflect', 'consider', 'deliberate', 'ruminate', 'speculate'],
            'say': ['articulate', 'assert', 'contend', 'postulate', 'propose', 'suggest', 'imply'],
            'make': ['create', 'generate', 'produce', 'manufacture', 'construct', 'fabricate', 'forge'],
            'get': ['obtain', 'acquire', 'procure', 'secure', 'attain', 'derive', 'extract']
        };
        
        const foundWords = new Set();
        const gaps = [];
        
        words.forEach((word, idx) => {
            const wordLower = word.toLowerCase().replace(/[^\w']/g, '');
            const posTag = posTags[idx] || '';
            
            if (wordLower.length > 2 && ['NOUN', 'VERB', 'PROPN'].includes(posTag)) {
                if (semanticMaps[wordLower]) {
                    foundWords.add(wordLower);
                }
            }
        });
        
        foundWords.forEach(word => {
            const alternatives = semanticMaps[word] || [];
            alternatives.forEach(alt => {
                const altLower = alt.toLowerCase().replace(/[^\w']/g, '');
                if (!allWordsLower.includes(altLower) && altLower.length > 2) {
                    gaps.push(alt);
                }
            });
        });
        
        // If still no results, add some universal alternatives
        if (gaps.length === 0) {
            const universalAlternatives = ['precisely', 'fundamentally', 'comprehensively', 'systematically', 
                                         'strategically', 'effectively', 'significantly', 'substantially'];
            universalAlternatives.forEach(alt => {
                const altLower = alt.toLowerCase();
                if (!allWordsLower.includes(altLower)) {
                    gaps.push(alt);
                }
            });
        }
        
        return [...new Set(gaps)].slice(0, 20);
    }
    
    // Legacy function for backwards compatibility (not used anymore)
    function calculateUnspokenWords(stats, words) {
        if (!stats || !words || words.length === 0) return [];
        
        const allWordsLower = words.map(w => w.toLowerCase().replace(/[^\w']/g, ''));
        const textLower = words.join(' ').toLowerCase();
        const posTags = appState.posTags || [];
        
        // Analyze actual words in text to find context-specific gaps
        const gaps = [];
        
        // Semantic word maps - more specific alternatives
        const semanticMaps = {
            // General -> Specific alternatives
            'say': ['articulate', 'assert', 'contend', 'postulate', 'propose', 'suggest', 'imply', 'hint', 'insinuate'],
            'think': ['contemplate', 'ponder', 'reflect', 'consider', 'deliberate', 'ruminate', 'muse', 'speculate'],
            'show': ['demonstrate', 'illustrate', 'reveal', 'expose', 'unveil', 'exhibit', 'manifest', 'evince'],
            'get': ['obtain', 'acquire', 'procure', 'secure', 'attain', 'derive', 'extract', 'garner'],
            'make': ['fabricate', 'construct', 'forge', 'create', 'generate', 'produce', 'manufacture', 'craft'],
            'use': ['utilize', 'employ', 'leverage', 'harness', 'wield', 'apply', 'deploy', 'exploit'],
            'big': ['substantial', 'considerable', 'significant', 'extensive', 'immense', 'vast', 'colossal', 'monumental'],
            'small': ['minute', 'minuscule', 'negligible', 'infinitesimal', 'microscopic', 'petite', 'diminutive'],
            'good': ['excellent', 'superior', 'outstanding', 'remarkable', 'exceptional', 'admirable', 'commendable'],
            'bad': ['deficient', 'inadequate', 'substandard', 'inferior', 'flawed', 'defective', 'unsatisfactory'],
            'important': ['crucial', 'vital', 'paramount', 'essential', 'imperative', 'critical', 'pivotal', 'fundamental'],
            'problem': ['dilemma', 'conundrum', 'predicament', 'quandary', 'challenge', 'obstacle', 'impediment', 'hurdle'],
            'help': ['assist', 'facilitate', 'enable', 'support', 'aid', 'foster', 'promote', 'advance'],
            'change': ['transform', 'modify', 'alter', 'revise', 'amend', 'adjust', 'adapt', 'reform'],
            'look': ['examine', 'scrutinize', 'inspect', 'observe', 'survey', 'peruse', 'analyze', 'study'],
            'see': ['perceive', 'discern', 'detect', 'recognize', 'identify', 'comprehend', 'grasp', 'apprehend'],
            'know': ['understand', 'comprehend', 'grasp', 'fathom', 'apprehend', 'discern', 'recognize', 'realize'],
            'feel': ['experience', 'perceive', 'sense', 'detect', 'discern', 'intuit', 'apprehend'],
            'want': ['desire', 'crave', 'yearn', 'long', 'aspire', 'covet', 'seek', 'pursue'],
            'need': ['require', 'necessitate', 'demand', 'mandate', 'entail', 'call for', 'warrant'],
            'try': ['attempt', 'endeavor', 'strive', 'seek', 'aim', 'undertake', 'pursue', 'venture'],
            'work': ['function', 'operate', 'perform', 'execute', 'accomplish', 'achieve', 'fulfill', 'complete'],
            'start': ['initiate', 'commence', 'embark', 'launch', 'inaugurate', 'begin', 'originate', 'establish'],
            'stop': ['cease', 'terminate', 'conclude', 'halt', 'discontinue', 'abandon', 'desist', 'refrain'],
            'give': ['provide', 'supply', 'furnish', 'deliver', 'bestow', 'grant', 'confer', 'allocate'],
            'take': ['extract', 'derive', 'obtain', 'acquire', 'seize', 'capture', 'appropriate', 'claim'],
            'find': ['discover', 'uncover', 'locate', 'identify', 'detect', 'unearth', 'reveal', 'ascertain'],
            'keep': ['maintain', 'preserve', 'retain', 'sustain', 'uphold', 'conserve', 'safeguard', 'protect'],
            'put': ['place', 'position', 'deposit', 'set', 'install', 'establish', 'implement', 'introduce'],
            'go': ['proceed', 'advance', 'progress', 'move', 'travel', 'journey', 'venture', 'depart'],
            'come': ['arrive', 'approach', 'emerge', 'appear', 'surface', 'materialize', 'manifest', 'occur'],
            'people': ['individuals', 'persons', 'citizens', 'populace', 'inhabitants', 'residents', 'community', 'society'],
            'thing': ['element', 'component', 'factor', 'aspect', 'facet', 'dimension', 'attribute', 'feature'],
            'way': ['method', 'approach', 'technique', 'strategy', 'procedure', 'process', 'mechanism', 'means'],
            'time': ['period', 'duration', 'interval', 'span', 'epoch', 'era', 'phase', 'stage'],
            'place': ['location', 'site', 'venue', 'setting', 'locale', 'position', 'spot', 'area'],
            'part': ['component', 'element', 'segment', 'portion', 'fraction', 'section', 'division', 'fragment'],
            'number': ['quantity', 'amount', 'figure', 'count', 'total', 'sum', 'aggregate', 'tally'],
            'group': ['collection', 'assembly', 'gathering', 'cluster', 'cluster', 'cohort', 'contingent', 'faction'],
            'system': ['framework', 'structure', 'mechanism', 'apparatus', 'infrastructure', 'network', 'organization'],
            'idea': ['concept', 'notion', 'principle', 'theory', 'hypothesis', 'premise', 'proposition', 'tenet'],
            'fact': ['reality', 'truth', 'actuality', 'certainty', 'verity', 'datum', 'evidence', 'information'],
            'reason': ['rationale', 'justification', 'explanation', 'motive', 'grounds', 'basis', 'premise', 'cause'],
            'result': ['outcome', 'consequence', 'effect', 'impact', 'ramification', 'repercussion', 'implication', 'byproduct'],
            'cause': ['trigger', 'catalyst', 'precipitant', 'stimulus', 'impetus', 'motive', 'incentive', 'driver'],
            'effect': ['impact', 'influence', 'consequence', 'ramification', 'repercussion', 'implication', 'outcome', 'result'],
            'process': ['procedure', 'method', 'mechanism', 'operation', 'workflow', 'protocol', 'routine', 'system'],
            'method': ['approach', 'technique', 'strategy', 'procedure', 'protocol', 'system', 'framework', 'mechanism'],
            'example': ['instance', 'illustration', 'case', 'specimen', 'sample', 'case study', 'demonstration', 'exemplar'],
            'case': ['instance', 'situation', 'scenario', 'circumstance', 'context', 'context', 'occurrence', 'episode'],
            'point': ['aspect', 'facet', 'dimension', 'element', 'component', 'factor', 'feature', 'attribute'],
            'question': ['inquiry', 'query', 'interrogation', 'enquiry', 'probe', 'investigation', 'examination'],
            'answer': ['response', 'reply', 'retort', 'rejoinder', 'solution', 'resolution', 'explanation', 'clarification'],
            'issue': ['matter', 'concern', 'topic', 'subject', 'affair', 'matter', 'situation', 'circumstance'],
            'area': ['region', 'zone', 'territory', 'domain', 'realm', 'sphere', 'field', 'sector'],
            'level': ['tier', 'stratum', 'echelon', 'grade', 'rank', 'stage', 'phase', 'degree'],
            'form': ['format', 'structure', 'configuration', 'arrangement', 'composition', 'design', 'pattern', 'model'],
            'type': ['category', 'classification', 'variety', 'kind', 'sort', 'genre', 'class', 'species'],
            'kind': ['variety', 'category', 'type', 'sort', 'class', 'genre', 'species', 'strain'],
            'sort': ['variety', 'category', 'type', 'kind', 'class', 'genre', 'species', 'strain'],
            'way': ['method', 'approach', 'technique', 'strategy', 'procedure', 'process', 'mechanism', 'means'],
            'use': ['utilize', 'employ', 'leverage', 'harness', 'wield', 'apply', 'deploy', 'exploit'],
            'way': ['method', 'approach', 'technique', 'strategy', 'procedure', 'process', 'mechanism', 'means']
        };
        
        // Find common/generic words in text and suggest specific alternatives
        const foundGenericWords = new Set();
        words.forEach((word, idx) => {
            const wordLower = word.toLowerCase().replace(/[^\w']/g, '');
            const posTag = posTags[idx] || '';
            
            // Only consider nouns, verbs, adjectives, adverbs
            if (['NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN'].includes(posTag)) {
                if (semanticMaps[wordLower]) {
                    foundGenericWords.add(wordLower);
                }
            }
        });
        
        console.log('calculateUnspokenWords: found generic words:', Array.from(foundGenericWords));
        
        // For each generic word found, suggest specific alternatives that aren't in text
        foundGenericWords.forEach(genericWord => {
            const alternatives = semanticMaps[genericWord] || [];
            alternatives.forEach(alt => {
                const altLower = alt.toLowerCase().replace(/[^\w']/g, '');
                // Check if alternative is not in text (more thorough check)
                const altInText = allWordsLower.some(w => w === altLower) || 
                                 textLower.includes(altLower);
                if (!altInText) {
                    gaps.push(alt);
                }
            });
        });
        
        console.log('calculateUnspokenWords: found gaps:', gaps.length, gaps.slice(0, 10));
        
        // Remove duplicates and limit
        return [...new Set(gaps)].slice(0, 20);
    }
    
    // Setup unspoken words hover effect
    function setupUnspokenWords() {
        const unspokenWords = document.querySelectorAll('.unspoken-word');
        unspokenWords.forEach(word => {
            word.addEventListener('mouseenter', () => {
                word.style.color = '#1e293b';
                word.style.backgroundColor = '#e2e8f0';
                word.style.borderColor = 'rgba(100, 116, 139, 0.5)';
                word.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9)';
                word.style.transform = 'translateY(-1px) scale(1.02)';
            });
            word.addEventListener('mouseleave', () => {
                word.style.color = '#475569';
                word.style.background = 'linear-gradient(135deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.95) 100%)';
                word.style.borderColor = 'rgba(148, 163, 184, 0.3)';
                word.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8)';
                word.style.transform = 'translateY(0) scale(1)';
            });
        });
    }
    
    // Setup evidence context toggles
    function setupEvidenceContext() {
        const triggers = document.querySelectorAll('.evidence-trigger');
        triggers.forEach(trigger => {
            trigger.addEventListener('click', () => {
                const category = trigger.getAttribute('data-category');
                const evidenceDiv = document.getElementById(`evidence-${category}`);
                if (evidenceDiv) {
                    const isVisible = evidenceDiv.style.display !== 'none';
                    evidenceDiv.style.display = isVisible ? 'none' : 'block';
                }
            });
        });
    }
    
    function renderPosHeatmap(posHeatmap, stats) {
        const heatmapContainer = document.getElementById('posHeatmap');
        if (!heatmapContainer) return;
        
        const totalWords = stats.totalWords || 1;
        const posColors = {};
        const posNames = {};
        Object.entries(CONFIG.POS_TAGS).forEach(([tag, { name, class: tagClass }]) => {
            if (tag.length <= 4 && tag === tag.toUpperCase()) {
                posColors[tag] = getTagColor(tagClass);
                posNames[tag] = name;
            }
        });
        
        // Sample heatmap - show every Nth word to make it more representative
        // For large texts, sample to show pattern without overwhelming
        const sampleSize = Math.min(200, posHeatmap.length);
        const step = Math.max(1, Math.floor(posHeatmap.length / sampleSize));
        const sampledHeatmap = [];
        for (let i = 0; i < posHeatmap.length; i += step) {
            sampledHeatmap.push(posHeatmap[i]);
        }
        
        // Group consecutive same POS tags
        let currentTag = sampledHeatmap[0] || 'X';
        let currentCount = 1;
        const segments = [];
        
        for (let i = 1; i < sampledHeatmap.length; i++) {
            if (sampledHeatmap[i] === currentTag) {
                currentCount++;
            } else {
                if (currentCount > 0) {
                    segments.push({ tag: currentTag, count: currentCount });
                }
                currentTag = sampledHeatmap[i];
                currentCount = 1;
            }
        }
        if (currentCount > 0) {
            segments.push({ tag: currentTag, count: currentCount });
        }
        
        // Render segments with minimum width for visibility
        segments.forEach(segment => {
            const width = Math.max(0.5, (segment.count / sampledHeatmap.length) * 100);
            const color = posColors[segment.tag] || '#E2E8F0';
            const div = document.createElement('div');
            div.style.width = `${width}%`;
            div.style.height = '100%';
            div.style.backgroundColor = color;
            div.style.transition = 'all 0.2s ease';
            div.style.minWidth = '2px';
            div.style.borderRight = '1px solid rgba(255, 255, 255, 0.3)';
            div.setAttribute('data-pos', segment.tag);
            div.title = `${posNames[segment.tag] || segment.tag}: ${segment.count} words`;
            div.style.cursor = 'pointer';
            
            // Add hover effect
            div.addEventListener('mouseenter', () => {
                div.style.opacity = '0.8';
                div.style.transform = 'scaleY(1.2)';
                div.style.zIndex = '5';
            });
            div.addEventListener('mouseleave', () => {
                div.style.opacity = '1';
                div.style.transform = 'scaleY(1)';
                div.style.zIndex = '1';
            });
            
            heatmapContainer.appendChild(div);
        });
        
        // Add click handler for highlighting
        heatmapContainer.addEventListener('click', (e) => {
            const clickedTag = e.target.getAttribute('data-pos');
            if (clickedTag) {
                highlightPosInText(clickedTag, stats);
            }
        });
    }
    
    function setupSkeletonMode(stats) {
        const skeletonBtn = document.getElementById('skeletonModeBtn');
        const skeletonFilter = document.getElementById('skeletonPosFilter');
        if (!skeletonBtn || !skeletonFilter) return;
        
        let skeletonModeActive = false;
        let selectedPos = '';
        
        // Populate filter
        Object.entries(CONFIG.POS_TAGS).forEach(([tag, { name }]) => {
            if (tag.length <= 4 && tag === tag.toUpperCase() && stats.posCounts[tag] > 0) {
                const option = document.createElement('option');
                option.value = tag;
                option.textContent = name;
                skeletonFilter.appendChild(option);
            }
        });
        
        skeletonBtn.addEventListener('click', () => {
            skeletonModeActive = !skeletonModeActive;
            skeletonBtn.textContent = `Skeleton Mode: ${skeletonModeActive ? 'On' : 'Off'}`;
            skeletonFilter.style.display = skeletonModeActive ? 'block' : 'none';
            
            if (!skeletonModeActive) {
                // Restore all words
                document.querySelectorAll('.pos-tag-extension').forEach(span => {
                    span.style.opacity = '1';
                    span.style.visibility = 'visible';
                });
                selectedPos = '';
            } else if (selectedPos) {
                applySkeletonMode(selectedPos);
            }
        });
        
        skeletonFilter.addEventListener('change', (e) => {
            selectedPos = e.target.value;
            if (skeletonModeActive && selectedPos) {
                applySkeletonMode(selectedPos);
            }
        });
    }
    
    function applySkeletonMode(posTag) {
        document.querySelectorAll('.pos-tag-extension').forEach(span => {
            const spanPos = span.getAttribute('data-pos');
            const tagInfo = CONFIG.POS_TAGS[Object.keys(CONFIG.POS_TAGS).find(tag => 
                CONFIG.POS_TAGS[tag].name === spanPos
            )] || CONFIG.POS_TAGS['X'];
            const normalizedTag = Object.keys(CONFIG.POS_TAGS).find(tag => 
                CONFIG.POS_TAGS[tag].name === spanPos && tag.length <= 4 && tag === tag.toUpperCase()
            ) || 'X';
            
            if (normalizedTag === posTag) {
                span.style.opacity = '1';
                span.style.visibility = 'visible';
            } else {
                span.style.opacity = '0.1';
                span.style.visibility = 'visible';
            }
        });
    }
    
    function setupPosHighlighting(stats) {
        // Add click handlers to POS stat items
        setTimeout(() => {
            document.querySelectorAll('.stat-item-pos-tagger').forEach(item => {
                const label = item.querySelector('.stat-label-pos-tagger');
                if (label) {
                    const posName = label.textContent.replace(':', '').trim();
                    const posTag = Object.keys(CONFIG.POS_TAGS).find(tag => 
                        CONFIG.POS_TAGS[tag].name === posName && tag.length <= 4 && tag === tag.toUpperCase()
                    );
                    
                    if (posTag) {
                        label.style.cursor = 'pointer';
                        label.title = 'Click to highlight in text';
                        label.addEventListener('click', () => {
                            highlightPosInText(posTag, stats);
                        });
                    }
                }
            });
        }, 100);
    }
    
    function highlightPosInText(posTag, stats) {
        // Remove previous highlights
        document.querySelectorAll('.pos-tag-extension').forEach(span => {
            span.style.outline = '';
            span.style.outlineOffset = '';
            span.style.transform = '';
            span.style.zIndex = '';
            span.style.transition = '';
            span.style.backgroundColor = '';
        });
        
        if (!posTag) return; // If no specific tag, don't highlight
        
        // Get the POS name and color from tag
        const posName = CONFIG.POS_TAGS[posTag]?.name;
        const posClass = CONFIG.POS_TAGS[posTag]?.class;
        if (!posName || !posClass) return;
        
        // Get colors for this POS tag
        const bgColor = getTagColor(posClass);
        const textColor = getTagTextColor(posClass);
        
        // Convert hex to rgba for background overlay
        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        };
        const rgb = hexToRgb(bgColor);
        const overlayColor = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)` : 'rgba(59, 130, 246, 0.2)';
        
        let highlightedCount = 0;
        let firstSpan = null;
        
        // Find and highlight matching tags
        document.querySelectorAll('.pos-tag-extension').forEach(span => {
            const spanPos = span.getAttribute('data-pos');
            
            // Match by POS name
            if (spanPos === posName) {
                // Get original styles to preserve text styling
                const originalFontSize = window.getComputedStyle(span).fontSize;
                const fontSize = parseFloat(originalFontSize) || 16;
                const borderWidth = Math.max(1, Math.round(fontSize * 0.08)); // 8% of font size, min 1px
                
                span.style.outline = `${borderWidth}px solid ${textColor}`;
                span.style.outlineOffset = '1px';
                span.style.transform = 'scale(1.02)';
                span.style.zIndex = '10';
                span.style.transition = 'all 0.2s';
                span.style.backgroundColor = overlayColor;
                
                if (!firstSpan) {
                    firstSpan = span;
                }
                highlightedCount++;
            }
        });
        
        // Scroll to first highlighted word
        if (firstSpan) {
            firstSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // Show notification with POS color
        if (highlightedCount > 0) {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                background: ${bgColor};
                color: ${textColor};
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 2147483648;
                font-size: 14px;
                font-weight: 600;
                border: 2px solid ${textColor};
            `;
            notification.textContent = `Highlighted ${highlightedCount} ${posName.toLowerCase()}${highlightedCount !== 1 ? 's' : ''}`;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.3s';
                setTimeout(() => notification.remove(), 300);
            }, 2000);
        }
        
        // Reset highlights after 5 seconds
        setTimeout(() => {
            document.querySelectorAll('.pos-tag-extension').forEach(span => {
                span.style.outline = '';
                span.style.outlineOffset = '';
                span.style.transform = '';
                span.style.zIndex = '';
                span.style.backgroundColor = '';
            });
        }, 5000);
    }
    

    function setupSearchPanel(stats) {
        const searchPanel = document.getElementById('searchPanelPosTagger');
        const posFilter = document.getElementById('posFilterPosTagger');
        const wordSearch = document.getElementById('wordSearchPosTagger');
        const searchResults = document.getElementById('searchResultsPosTagger');
        
        if (!searchPanel || !posFilter || !wordSearch || !searchResults) return;
        
        // Show search panel
        searchPanel.style.display = 'block';
        
        // Populate POS filter dropdown
        posFilter.innerHTML = '<option value="all">All Parts of Speech</option>';
        Object.entries(CONFIG.POS_TAGS).forEach(([tag, { name }]) => {
            if (tag.length <= 4 && tag === tag.toUpperCase() && stats.posCounts[tag] > 0) {
                const option = document.createElement('option');
                option.value = tag;
                option.textContent = name;
                posFilter.appendChild(option);
            }
        });
        
        // Store stats for search
        searchPanel._stats = stats;
        
        // Search function
        function performSearch() {
            const searchTerm = wordSearch.value.toLowerCase().trim();
            const selectedPos = posFilter.value;
            
            let filteredWords = Object.entries(stats.wordPosMap);
            
            if (searchTerm) {
                filteredWords = filteredWords.filter(([word, data]) => 
                    word.includes(searchTerm) || data.original.toLowerCase().includes(searchTerm)
                );
            }
            
            if (selectedPos !== 'all') {
                filteredWords = filteredWords.filter(([word, data]) => 
                    data.tags[selectedPos] > 0
                );
            }
            
            filteredWords.sort((a, b) => b[1].totalCount - a[1].totalCount);
            
            if (filteredWords.length === 0) {
                searchResults.innerHTML = '<p style="text-align: center; color: #64748b; font-size: 13px; padding: 20px;">No words found</p>';
                return;
            }
            
            let resultsHtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
            
            filteredWords.forEach(([word, data]) => {
                const tagEntries = Object.entries(data.tags);
                const relevantTags = selectedPos === 'all' 
                    ? tagEntries 
                    : tagEntries.filter(([tag]) => tag === selectedPos);
                
                if (relevantTags.length === 0) return;
                
                const percentage = ((data.totalCount / stats.totalWords) * 100).toFixed(1);
                const wordId = `word-${word.replace(/[^a-z0-9]/g, '-')}-${Math.random().toString(36).substr(2, 9)}`;
                const contextId = `context-${wordId}`;
                const hasContext = data.contexts && data.contexts.length > 0;
                
                resultsHtml += `
                    <div style="padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid rgba(203, 213, 225, 0.3);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 4px;">${data.original}</div>
                                <div style="font-size: 12px; color: #64748b;">Total frequency: ${data.totalCount} (${percentage}%)</div>
                            </div>
                            ${hasContext ? `<button class="context-toggle-btn" data-word-id="${wordId}" style="background: transparent; border: 1px solid rgba(203, 213, 225, 0.5); color: #64748b; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-left: 8px;">Show context</button>` : ''}
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                `;
                
                relevantTags.forEach(([tag, count]) => {
                    const tagInfo = CONFIG.POS_TAGS[tag] || CONFIG.POS_TAGS['X'];
                    const tagPercentage = ((count / stats.totalWords) * 100).toFixed(1);
                    
                    resultsHtml += `
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span style="display: inline-block; padding: 4px 8px; background: ${getTagColor(tagInfo.class)}; color: ${getTagTextColor(tagInfo.class)}; border-radius: 4px; font-size: 11px; font-weight: 500;">
                                ${tagInfo.name}
                            </span>
                            <span style="font-size: 11px; color: #64748b;">${count} (${tagPercentage}%)</span>
                        </div>
                    `;
                });
                
                resultsHtml += `
                        </div>
                        ${hasContext ? `<div id="${contextId}" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(203, 213, 225, 0.3);">
                            <div style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 8px;">Context:</div>
                            <div style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto;">
                        ` : ''}
                `;
                
                if (hasContext) {
                    // Get unique contexts (showing word surroundings, not full sentences)
                    const seenContexts = new Set();
                    const uniqueContexts = [];
                    for (const ctx of data.contexts) {
                        const contextKey = ctx.contextKey || `${ctx.sentenceIndex}-0`;
                        if (!seenContexts.has(contextKey)) {
                            seenContexts.add(contextKey);
                            uniqueContexts.push(ctx);
                            if (uniqueContexts.length >= 10) break;
                        }
                    }
                    
                    uniqueContexts.forEach((ctx, idx) => {
                        // Use context (surrounding words) if available, otherwise fall back to sentence
                        const contextText = ctx.context || ctx.sentence || '';
                        let formattedContext = contextText.replace(/\s+/g, ' ').trim();
                        
                        // Add ellipsis if context is not at the start/end
                        if (ctx.context && ctx.wordPosition !== undefined) {
                            const words = formattedContext.split(' ');
                            if (ctx.wordPosition > 0) {
                                formattedContext = '... ' + formattedContext;
                            }
                            if (ctx.wordPosition < words.length - 1) {
                                formattedContext = formattedContext + ' ...';
                            }
                        }
                        
                        // Highlight the word in context
                        const escapedOriginal = data.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const highlightedContext = formattedContext.replace(
                            new RegExp(`\\b${escapedOriginal}\\b`, 'gi'),
                            `<strong style="color: #3b82f6; background: rgba(59, 130, 246, 0.1); padding: 2px 4px; border-radius: 3px;">$&</strong>`
                        );
                        resultsHtml += `
                            <div style="font-size: 12px; color: #1e293b; line-height: 1.6; padding: 8px 10px; background: white; border-radius: 4px; border: 1px solid rgba(203, 213, 225, 0.3); margin-bottom: 6px;">
                                <span style="color: #64748b; font-weight: 600; margin-right: 8px; font-size: 11px;">${idx + 1}.</span>
                                <span style="white-space: pre-wrap; word-wrap: break-word;">${highlightedContext}</span>
                            </div>
                        `;
                    });
                    
                    if (data.contexts.length > 10) {
                        resultsHtml += `<div style="font-size: 11px; color: #94a3b8; font-style: italic; padding: 4px 0;">... and ${data.contexts.length - 10} more sentences</div>`;
                    }
                    
                    resultsHtml += `
                            </div>
                        </div>`;
                }
                
                resultsHtml += `
                    </div>
                `;
            });
            
            resultsHtml += '</div>';
            searchResults.innerHTML = resultsHtml;
        }
        
        // Event listeners
        wordSearch.addEventListener('input', performSearch);
        posFilter.addEventListener('change', performSearch);
        
        // Context toggle listeners
        searchResults.addEventListener('click', (e) => {
            if (e.target.classList.contains('context-toggle-btn')) {
                const wordId = e.target.getAttribute('data-word-id');
                const contextId = `context-${wordId}`;
                const contextDiv = document.getElementById(contextId);
                
                if (contextDiv) {
                    const isHidden = contextDiv.style.display === 'none';
                    contextDiv.style.display = isHidden ? 'block' : 'none';
                    e.target.textContent = isHidden ? 'Hide context' : 'Show context';
                }
            }
        });
        
        // Initial search
        performSearch();
    }
    
    function getTagColor(className) {
        const colorMap = {
            'pos-NOUN-extension': '#FEE2E2',
            'pos-VERB-extension': '#E0F2FE',
            'pos-ADJ-extension': '#DCFCE7',
            'pos-ADV-extension': '#FEF9C3',
            'pos-PRON-extension': '#F8EDF5',
            'pos-DET-extension': '#FED7AA',
            'pos-ADP-extension': '#F3E8FF',
            'pos-CONJ-extension': '#FCC8C8',
            'pos-NUM-extension': '#F1F5F9',
            'pos-PART-extension': '#CFFAFE',
            'pos-X-extension': '#E2E8F0',
            'pos-PROPN-extension': '#F0E6F5',
            'pos-AUX-extension': '#E0E7FF',
            'pos-INTJ-extension': '#FCE7F3',
            'pos-UNKNOWN-extension': '#E5E7EB'
        };
        return colorMap[className] || '#E2E8F0';
    }
    
    function getTagTextColor(className) {
        const colorMap = {
            'pos-NOUN-extension': '#DC2626',
            'pos-VERB-extension': '#0369A1',
            'pos-ADJ-extension': '#166534',
            'pos-ADV-extension': '#854D0E',
            'pos-PRON-extension': '#C9738F',
            'pos-DET-extension': '#C2410C',
            'pos-ADP-extension': '#6B21A8',
            'pos-CONJ-extension': '#991B1B',
            'pos-NUM-extension': '#334155',
            'pos-PART-extension': '#155E75',
            'pos-X-extension': '#475569',
            'pos-PROPN-extension': '#9B5A7A',
            'pos-AUX-extension': '#3730A3',
            'pos-INTJ-extension': '#9D174D',
            'pos-UNKNOWN-extension': '#6B7280'
        };
        return colorMap[className] || '#475569';
    }

    async function analyzePage() {
        const text = getTextContent();
        if (!text || !text.trim()) {
            alert('No text found on the page or selection is empty');
            return;
        }
        
        saveOriginalContent();
        
        const tagBtn = document.getElementById('tagBtnPosTagger');
        const clearBtn = document.getElementById('clearBtnPosTagger');
        if (tagBtn) tagBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = true;
        
        try {
            if (!appState.winkNLPLoaded) {
                await loadWinkNLP();
            }
            
            if (appState.winkNLPLoaded && appState.winkNLPModel && window.winkNLP) {
                // Use enhanced tagging with both winkNLP and en-pos
                const result = enhancedPosTagging(text);
                displayTaggedText(result.words, result.posTags);
                displayStatistics(result.stats);
                
                appState.words = result.words;
                appState.posTags = result.posTags;
                appState.originalText = text;
                appState.sentences = result.stats.sentences || [];
                appState.isTagged = true;
                
                // Update status to show which tagger was used
                const taggerUsed = appState.enPosLoaded ? 'winkNLP + en-pos' : 'winkNLP (en-pos not available)';
                updateModelStatus(`Analysis complete (${taggerUsed})`, true);
            } else {
                throw new Error('NLP engine is not loaded');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            
            // Fallback to basic winkNLP if enhanced tagging fails
            try {
                if (appState.winkNLPLoaded && appState.winkNLPModel && window.winkNLP) {
                    const result = analyzeWithWinkNLP(text);
                    displayTaggedText(result.words, result.posTags);
                    displayStatistics(result.stats);
                    
                    appState.words = result.words;
                    appState.posTags = result.posTags;
                    appState.originalText = text;
                    appState.sentences = result.stats.sentences || [];
                    appState.isTagged = true;
                    
                    updateModelStatus('Analysis complete (winkNLP only - fallback)', true);
                    console.warn('Used fallback to basic winkNLP tagging');
                    return;
                }
            } catch (fallbackError) {
                console.error('Fallback analysis also failed:', fallbackError);
            }
            
            updateModelStatus('Error: ' + error.message, false);
            alert('Error analyzing text: ' + error.message);
        } finally {
            if (tagBtn) tagBtn.disabled = false;
            if (clearBtn) clearBtn.disabled = false;
        }
    }

    function clearAnalysis() {
        if (!appState.isTagged) return;
        location.reload();
    }

    window.addEventListener('resize', () => {
        const panel = appState.controlPanel;
        if (!panel) return;
        
        const rect = panel.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let newX = parseFloat(panel.style.left) || 0;
        let newY = parseFloat(panel.style.top) || 0;
        
        if (newX + rect.width > viewportWidth) {
            newX = viewportWidth - rect.width - 20;
            panel.style.left = `${Math.max(0, newX)}px`;
            chrome.storage.local.set({ 'posTaggerPanelPosition': { x: newX, y: newY } });
        }
        
        if (newY + rect.height > viewportHeight) {
            newY = viewportHeight - rect.height - 20;
            panel.style.top = `${Math.max(0, newY)}px`;
            chrome.storage.local.set({ 'posTaggerPanelPosition': { x: newX, y: newY } });
        }
    });

    function init() {
        // POS Tagger: Initializing

        // Idempotency: if panel exists, do nothing
        if (document.getElementById('controlPanelPosTagger')) {
            return;
        }
        
        if (document.body) {
            // POS Tagger: Body exists, creating panel immediately
            createControlPanel();
        } else {
            // POS Tagger: Body not ready, setting up observers
            
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    // POS Tagger: DOMContentLoaded fired
                    if (document.body && !document.getElementById('controlPanelPosTagger')) {
                        createControlPanel();
                    }
                });
            }
            
            const observer = new MutationObserver((mutations, obs) => {
                if (document.body && !document.getElementById('controlPanelPosTagger')) {
                    // POS Tagger: Body detected via MutationObserver
                    obs.disconnect();
                    createControlPanel();
                }
            });
            observer.observe(document.documentElement, { 
                childList: true, 
                subtree: true 
            });
            
            setTimeout(() => {
                if (document.body && !document.getElementById('controlPanelPosTagger')) {
                    // POS Tagger: Body detected via timeout fallback
                    createControlPanel();
                }
            }, 1000);
        }
    }

    // POS Tagger: Script loaded, starting init
    init();
    
    setTimeout(() => {
        if (!document.getElementById('controlPanelPosTagger') && document.body) {
            // POS Tagger: Backup initialization
            createControlPanel();
        }
    }, 500);
})();