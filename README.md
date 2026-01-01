# Gaps

![Gaps Extension](screenshots/gaps.png)

A sophisticated Chrome extension for advanced text analysis that provides real-time part-of-speech tagging, readability metrics, and semantic gap analysis directly on web pages.

## Features

### Part-of-Speech Tagging
- **Hybrid NLP Approach**: Combines winkNLP and en-pos libraries for enhanced accuracy
- **Real-time Analysis**: Instantly tags words on any webpage with color-coded visual indicators
- **Smart Disambiguation**: Handles edge cases including contractions, hyphenated words, CamelCase, and apostrophes
- **Custom Tag Colors**: Distinct color scheme for each part of speech with customizable styling

### Text Statistics (Said)
- **Word Count Metrics**: Total words, unique words, and frequency analysis
- **Readability Analysis**: Flesch Reading Ease score with benchmarking scales (Hemingway to Legal Document)
- **Sentence Length Metrics**: Average sentence length with comparative benchmarks
- **POS Heatmap**: Visual representation of part-of-speech distribution across the text
- **Skeleton Mode**: Filter text to show only selected parts of speech
- **Synchronization**: Click any POS statistic to highlight all instances in the text

### Semantic Analysis (Unsaid)
- **Sensory Profile**: Analyzes sensory language (sight, sound, touch, smell, taste)
- **Confidence Gap**: Measures absolute vs. hedged language with confidence index
- **Abstraction Level**: Evaluates concrete vs. abstract language usage
- **Perspective Analysis**: Assesses subjective vs. objective perspective based on pronoun usage
- **Temporal Focus**: Analyzes past, present, and future tense distribution
- **Argumentation Logic**: Identifies causality, contrast, and addition patterns
- **Evidence Context**: Click any metric to see specific words that contributed to the analysis
- **Unspoken Tags**: Suggests contextually relevant words that are semantically close to the text's themes but absent from it, using local Word2Vec/GloVe embeddings

## Technical Details

### Architecture
- **Content Script**: Analyzes and tags text directly in the DOM
- **Hybrid Tagging**: Uses winkNLP for initial analysis and en-pos for disambiguation
- **Local Embeddings**: Includes a compressed GloVe model (top 10,000 words, 50 dimensions) for semantic analysis
- **Webpack Build**: Bundled for optimal performance and compatibility

### NLP Libraries
- [winkNLP](https://winkjs.org/wink-nlp/) - Natural language processing
- [en-pos](https://www.npmjs.com/package/en-pos) - Part-of-speech tagging
- [wink-eng-lite-web-model](https://winkjs.org/wink-eng-lite-web-model/) - Lightweight English model

### Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/gaps-extension.git
cd gaps-extension
```

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

4. Load in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `gaps-extension` directory

### Usage

1. Navigate to any webpage with text content
2. Click the extension icon in the toolbar
3. Click "Tag Text" to analyze the page
4. Explore the "Said" tab for traditional statistics
5. Explore the "Unsaid" tab for semantic and stylistic analysis

## Development

### Build
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

## Notes

This extension uses advanced NLP techniques and may occasionally produce inaccurate results, particularly with:
- Highly technical or domain-specific terminology
- Uncommon word forms or neologisms
- Complex sentence structures
- Mixed languages or code snippets

The semantic analysis feature relies on local embeddings and may suggest words that are contextually relevant but not always perfectly aligned with the text's specific domain.

## License

MIT

## Credits

Built by jacotu

