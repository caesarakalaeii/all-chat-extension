const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    'background': './src/background/service-worker.ts',
    'content-scripts/twitch': './src/content-scripts/twitch.ts',
    'content-scripts/youtube': './src/content-scripts/youtube.ts',
    'ui/chat-bundle': './src/ui/index.tsx',
    'popup/popup': './src/popup/popup.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'assets', to: 'assets', noErrorOnMissing: true },
        { from: 'src/content-scripts/styles.css', to: 'content-scripts/styles.css', noErrorOnMissing: true }
      ]
    }),
    new HtmlWebpackPlugin({
      template: './src/ui/chat-container.html',
      filename: 'ui/chat-container.html',
      chunks: ['ui/chat-bundle']
    }),
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup/popup.html',
      chunks: ['popup/popup']
    })
  ]
};
