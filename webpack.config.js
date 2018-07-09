const { CheckerPlugin } = require('awesome-typescript-loader');
const path = require("path");

module.exports = {
  mode: "production",
  entry: "./src/main.ts",
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "awesome-typescript-loader",
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  },
  output: {
    filename: "main.js",
    path: path.resolve(__dirname, "Scripts"),
    libraryTarget: "amd"
  },
  plugins: [
    new CheckerPlugin()
  ],
  externals: /^((esri)|(dojo))/
};
