/**
 * winkNLP Bundle Loader
 * Bundles winkNLP and wink-eng-lite-web-model for Chrome Extension
 * 
 * This file is the source for webpack bundling.
 * After running "npm run build", wink-nlp-bundle.js will be created.
 */

// Import winkNLP and model
const winkNLP = require('wink-nlp');
const model = require('wink-eng-lite-web-model');

// Initialize winkNLP with the model immediately
const nlp = winkNLP(model);
const its = nlp.its;

// Export to window for use in content script
// This will be available globally after the bundle loads
if (typeof window !== 'undefined') {
    window.winkNLP = winkNLP;
    window.winkNLPModel = model;
    window.winkNLPLoaded = true;
    
    // Also export initialized nlp instance for convenience
    window.winkNLPInstance = nlp;
    window.winkNLPIts = its;
    
    console.log('winkNLP bundle loaded successfully');
}

// Export for CommonJS
module.exports = { winkNLP, model, nlp, its };

