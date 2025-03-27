const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: {
    background: './background/background.js',
    popup: './popup/popup.js',
    options: './options/options.js',
    content: './content/content.js',
    dashboard: './dashboard/dashboard.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/[name].js',
    clean: true,
  },
  module: {
    rules: [
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
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons' },
        { from: 'popup/popup.css', to: 'popup/popup.css' },
        { from: 'options/options.css', to: 'options/options.css' },
        { from: 'dashboard/dashboard.css', to: 'dashboard/dashboard.css' }, // Add this line
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
    }), // Add this plugin
  ],
  devtool: 'cheap-module-source-map',
  mode: 'development',
};