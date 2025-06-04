module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        chrome: "80",
        firefox: "72"
      },
      modules: false,
      useBuiltIns: 'usage',
      corejs: 3
    }],
    '@babel/preset-typescript',
    ['@babel/preset-react', {
      runtime: 'automatic'
    }]
  ],
  plugins: [
    '@babel/plugin-transform-optional-chaining',
    '@babel/plugin-transform-nullish-coalescing-operator'
  ]
};