const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  mode: 'development',
  devtool: 'source-map',
  target: 'webworker',
  entry: {
    dashboard: './src/dashboard/index.js',
    background: './src/background/background.js',
    popup: './src/popup/popup.js',
    options: './src/options/options.js',
    content: './src/content/content.js',
    diagnostics: './src/popup/diagnostics.js' // Add diagnostics entry point
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: function(pathData) {
      // Special case for diagnostics.js - put it directly in popup directory
      if (pathData.chunk.name === 'diagnostics') {
        return 'popup/diagnostics.js';
      }
      // Default pattern for other files
      return '[name]/[name].js';
    },
    clean: true,
    publicPath: '/',
    globalObject: 'self',  
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader'
        ]
      }
    ]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@utils': path.resolve(__dirname, 'src/utils')
    },
    extensions: ['.js']
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name]/[name].css'
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "src/manifest.json" },
        { from: "src/assets/icons", to: "icons" },
        { from: "src/dashboard/dashboard.html", to: "dashboard" },
        { from: "src/popup/popup.html", to: "popup" },
        { from: "src/popup/diagnostics.html", to: "popup" },
        { from: "src/options/options.html", to: "options" }
      ]
    })
  ]
};