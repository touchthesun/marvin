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
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/[name].js',
    clean: true,
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
      '@content': path.resolve(__dirname, 'content')
    }
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons' },
        { from: 'popup/popup.css', to: 'popup/popup.css' },
        { from: 'popup/diagnostics.html', to: 'popup/diagnostics.html' },
        { from: 'options/options.css', to: 'options/options.css' },
        { from: 'dashboard/dashboard.css', to: 'dashboard/dashboard.css' },
        { from: 'dashboard/dashboard-minimal.html', to: 'dashboard/dashboard-minimal.html' },
        { from: 'popup/diagnostics.js', to: 'popup/diagnostics.js' },
        { from: 'shared/utils', to: 'shared/utils' },
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
    new HtmlWebpackPlugin({
      template: './popup/diagnostics.html',
      filename: 'popup/diagnostics.html',
      chunks: [],
      inject: false, 
    }),
  ],
  devtool: 'cheap-module-source-map',
  mode: 'development',
};