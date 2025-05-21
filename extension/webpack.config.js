const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  mode: 'development',
  devtool: 'source-map',
  // Remove target: 'webworker' as it's not needed for service workers
  entry: {
    dashboard: './src/dashboard/dashboard.js',
    background: './src/background/background.js',
    popup: './src/popup/popup.js',
    options: './src/options/options.js',
    content: './src/content/content.js',
    diagnostics: './src/popup/diagnostics.js' 
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
    // Remove globalObject: 'self' as it's not needed
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'style-loader'
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
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@constants': path.resolve(__dirname, 'src/constants'),
      '@assets': path.resolve(__dirname, 'src/assets'),
      '@background': path.resolve(__dirname, 'src/background'),
      '@content': path.resolve(__dirname, 'src/content'),
      '@dashboard': path.resolve(__dirname, 'src/dashboard'),
      '@popup': path.resolve(__dirname, 'src/popup'),
      '@options': path.resolve(__dirname, 'src/options')
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
  ],
  optimization: {
    // Disable code splitting for service workers
    splitChunks: false,
    // Minimize bundle size
    minimize: true
  }
};