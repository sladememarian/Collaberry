module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // NativeWind v4 hooks in through babel-preset-expo's jsxImportSource.
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Path alias: @/… → ./src/…
      [
        "module-resolver",
        {
          root: ["./src"],
          extensions: [".ios.js", ".android.js", ".js", ".ts", ".tsx", ".json"],
          alias: { "@": "./src" },
        },
      ],
    ],
  };
};
