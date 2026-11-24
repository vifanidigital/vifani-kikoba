const { readFileSync, writeFileSync } = require('node:fs');

// NativeWind 4 eagerly reads this deprecated React Native export, even though
// this app never renders ImageBackground. Keep the other interop registrations.
const file = require.resolve('react-native-css-interop/dist/runtime/components.js');
const source = readFileSync(file, 'utf8');
const registration = /\(0, api_1\.remapProps\)\(react_native_1\.ImageBackground, \{\s*className: "style",\s*imageClassName: "imageStyle",\s*\}\);\r?\n/;
const patched = source.replace(registration, '');
if (patched !== source) writeFileSync(file, patched);
