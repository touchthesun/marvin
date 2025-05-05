const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: {
    dashboard: './src/dashboard/index.js',
    background: './src/background/index.js',
    popup: './src/popup/popup.js',
    options: './src/options/options.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/[name].js',
    clean: true
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
    new CopyWebpackPlugin({
      patterns: [
        { from: "src/manifest.json" },
        { from: "src/assets/icons", to: "icons" },
        { from: "src/dashboard/dashboard.html", to: "dashboard" },
        { from: "src/dashboard/dashboard.css", to: "dashboard" },
        { from: "src/popup/popup.html", to: "popup" },
        { from: "src/popup/popup.css", to: "popup" },
        { from: "src/options/options.html", to: "options" },
        { from: "src/options/options.css", to: "options" }
      ]
    })
  ]
};




// old  webpack.config.js for reference

// const path = require('path');
// const CopyPlugin = require('copy-webpack-plugin');
// const HtmlWebpackPlugin = require('html-webpack-plugin');

// module.exports = {
//   entry: {
//     background: './src/background/background.js',
//     popup: './src/popup/popup.js',
//     options: './src/options/options.js',
//     content: './src/content/content.js',
//     dashboard: './src/dashboard/dashboard.js',
//     'components/core/navigation': './src/components/core/navigation.js',
//     'components/panels/overview/overview-panel': './src/components/panels/overview/overview-panel.js',
//     'components/panels/capture/capture-panel': './src/components/panels/capture/capture-panel.js',
//     'components/panels/knowledge/knowledge-panel': './src/components/panels/knowledge/knowledge-panel.js',
//     'components/panels/settings/settings-panel': './src/components/panels/settings/settings-panel.js',
//     'components/panels/tasks/tasks-panel': './src/components/panels/tasks/tasks-panel.js',
//     'components/panels/assistant/assistant-panel': './src/components/panels/assistant/assistant-panel.js',
//     'utils/ui-utils': './src/utils/ui-utils.js',
//     'components/panels/debug/navigation-debug': './src/components/panels/debug/navigation-debug.js',
//     'core/module-loader': './src/core/module-loader.js',
//     'core/component-loader': './src/core/component-loader.js',
//     'components/panels/debug/debug-panel': './src/components/panels/debug/debug-panel.js'
//   },

//   output: {
//     path: path.resolve(__dirname, 'dist'),
//     filename: '[name]/[name].js',
//     clean: true,
//   },
//   // Add this configuration for service worker support
//   experiments: {
//     outputModule: true, // Enable ES module output
//   },
//   module: {
//     rules: [
//       {
//         test: /\.js$/,
//         exclude: /node_modules/,
//         use: {
//           loader: 'babel-loader',
//           options: {
//             presets: [
//               ['@babel/preset-env', { 
//                 targets: {
//                   chrome: "80",
//                   firefox: "72"
//                 }
//               }]
//             ],
//             plugins: [
//               '@babel/plugin-proposal-optional-chaining',
//               '@babel/plugin-proposal-nullish-coalescing-operator'
//             ]
//           }
//         }
//       },
//       {
//         test: /\.(ts|tsx)$/,
//         use: 'ts-loader',
//         exclude: /node_modules/,
//       },
//       {
//         test: /\.css$/,
//         use: ['style-loader', 'css-loader'],
//       },
//     ],
//   },
//   resolve: {
//     extensions: ['.js', '.jsx', '.json'],
//     alias: {
//       '@shared': path.resolve(__dirname, 'src/components/shared'),
//       '@dashboard': path.resolve(__dirname, 'src/dashboard'),
//       '@background': path.resolve(__dirname, 'src/background'),
//       '@content': path.resolve(__dirname, 'src/content'),
//       // Add specific aliases for component paths
//       '@components': path.resolve(__dirname, 'src/components'),
//       '@services': path.resolve(__dirname, 'src/services'),
//       '@utils': path.resolve(__dirname, 'src/utils'),
//       '@core': path.resolve(__dirname, 'src/core'),
//       '@constants': path.resolve(__dirname, 'src/constants')
//     }
//   },
//   plugins: [
//     new CopyPlugin({
//       patterns: [
//         { from: 'manifest.json', to: 'manifest.json' },
//         { from: 'icons', to: 'icons' },
//         { from: 'src/popup/popup.css', to: 'popup/popup.css' },
//         { from: 'src/popup/diagnostics.html', to: 'popup/diagnostics.html' },
//         { from: 'src/popup/diagnostics.js', to: 'popup/diagnostics.js' },
//         { from: 'src/components/shared/diagnostictools.js', to: 'shared/utils/DiagnosticTools.js' },
//         { from: 'src/options/options.css', to: 'options/options.css' },
//         { from: 'src/dashboard/dashboard.css', to: 'dashboard/dashboard.css' },
        
//         // Copy the entire utils directory
//         { from: 'src/utils', to: 'utils' },
        
//         // Copy dashboard component files
//         { from: 'src/components', to: 'components' },
        
//         // Copy dashboard services
//         { from: 'src/services', to: 'services' },
        
//         // Copy core files
//         { from: 'src/core', to: 'core' },
        
//         // Copy constants
//         { from: 'src/constants', to: 'constants' },
//       ],
//     }),    
//     new HtmlWebpackPlugin({
//       template: './src/popup/popup.html',
//       filename: 'popup/popup.html',
//       chunks: ['popup'],
//     }),
//     new HtmlWebpackPlugin({
//       template: './src/options/options.html',
//       filename: 'options/options.html',
//       chunks: ['options'],
//     }),
//     new HtmlWebpackPlugin({
//       template: './src/dashboard/dashboard.html',
//       filename: 'dashboard/dashboard.html',
//       chunks: ['dashboard'],
//     }),
//   ],
//   // Special configuration for the background script
//   optimization: {
//     moduleIds: 'deterministic',
//     // Ensure components are not split into chunks
//     splitChunks: {
//       cacheGroups: {
//         defaultVendors: false,
//         default: false
//       }
//     }
//   },
//   // Different output configuration for service workers
//   target: ['web', 'es2020'],
//   devtool: 'cheap-module-source-map',
//   mode: 'development',
// };