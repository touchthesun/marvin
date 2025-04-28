const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: {
    background: './background/background.js',
    popup: './popup/popup.js',
    options: './options/options.js',
    content: './content/content.js',
    dashboard: './dashboard/js/dashboard.js'
    // Remove the components from entry points to avoid conflicts
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/[name].js',
    clean: true,
  },
  // Add this configuration for service worker support
  experiments: {
    outputModule: true, // Enable ES module output
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { 
                targets: {
                  chrome: "80",
                  firefox: "72"
                }
              }]
            ],
            plugins: [
              '@babel/plugin-proposal-optional-chaining',
              '@babel/plugin-proposal-nullish-coalescing-operator'
            ]
          }
        }
      },
      {
        test: /\.(ts|tsx)$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@dashboard': path.resolve(__dirname, 'dashboard'),
      '@background': path.resolve(__dirname, 'background'),
      '@content': path.resolve(__dirname, 'content'),
      // Add specific aliases for component paths
      '@components': path.resolve(__dirname, 'dashboard/js/components'),
      '@services': path.resolve(__dirname, 'dashboard/js/services'),
      '@utils': path.resolve(__dirname, 'dashboard/js/utils')
    }
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons' },
        { from: 'popup/popup.css', to: 'popup/popup.css' },
        { from: 'popup/diagnostics.html', to: 'popup/diagnostics.html' },
        { from: 'popup/diagnostics.js', to: 'popup/diagnostics.js' },
        { from: 'shared/utils/DiagnosticTools.js', to: 'shared/utils/DiagnosticTools.js' },
        { from: 'options/options.css', to: 'options/options.css' },
        { from: 'dashboard/dashboard.css', to: 'dashboard/dashboard.css' },
        { from: 'dashboard/dashboard-minimal.html', to: 'dashboard/dashboard-minimal.html' },
        
        // Copy the entire shared utils directory
        { from: 'shared/utils', to: 'shared/utils' },
        
        // Copy dashboard component files explicitly
        { from: 'dashboard/js/components', to: 'dashboard/js/components' },
        
        // Copy dashboard services
        { from: 'dashboard/js/services', to: 'dashboard/js/services' },
        
        // Copy dashboard utilities
        { from: 'dashboard/js/utils', to: 'dashboard/js/utils' },
      ],
    }),
    new HtmlWebpackPlugin({
      template: './popup/popup.html',
      filename: 'popup/popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: './options/options.html',
      filename: 'options/options.html',
      chunks: ['options'],
    }),
    new HtmlWebpackPlugin({
      template: './dashboard/dashboard.html',
      filename: 'dashboard/dashboard.html',
      chunks: ['dashboard'],
    }),
  ],
  // Special configuration for the background script
  optimization: {
    moduleIds: 'deterministic',
    // Remove the splitChunks configuration that was causing conflicts
  },
  // Different output configuration for service workers
  target: ['web', 'es2020'],
  devtool: 'cheap-module-source-map',
  mode: 'development',
};