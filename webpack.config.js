const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    'wink-nlp-bundle': './src/wink-nlp-loader.js',
    'content': './content.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'embeddings.json', to: 'embeddings.json' },
        { from: 'embeddings.json', to: '../embeddings.json' } // Also copy to root for web_accessible_resources
      ]
    })
  ],
  performance: {
    hints: false
  },
  resolve: {
    fallback: {
      "util": require.resolve("util"),
      "path": require.resolve("path-browserify"),
      "fs": false,
      "crypto": false,
      "stream": false,
      "buffer": false
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules\/(?!(en-pos|wink-eng-lite-web-model|wink-nlp)\/).*/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-transform-runtime'],
            sourceType: 'unambiguous'
          }
        }
      }
    ]
  },
  // Enable source maps for better debugging
  devtool: 'source-map',
  mode: 'production',
  optimization: {
    minimize: true
  },
  target: 'web'
};

