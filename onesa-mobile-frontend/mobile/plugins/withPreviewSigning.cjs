const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// Onesa: use the Android toolchain debug key; release remains unsigned.';

/** Keep regenerated native projects free of shared signing keys. */
module.exports = function withPreviewSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('Onesa preview signing expects the Expo Groovy Android template.');
    }
    let contents = mod.modResults.contents;
    if (contents.includes(marker)) return mod;

    const debugBlock = /    signingConfigs \{\s+debug \{\s+storeFile file\('debug\.keystore'\)\s+storePassword 'android'\s+keyAlias 'androiddebugkey'\s+keyPassword 'android'\s+\}\s+\}/;
    const releaseSigning = /(release \{\s+\/\/ Caution![\s\S]*?\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\s+)signingConfig signingConfigs\.debug/;

    if (!debugBlock.test(contents) || !releaseSigning.test(contents)) {
      throw new Error('Expo Android signing template changed; review native signing before regenerating.');
    }

    contents = contents.replace(debugBlock, `    ${marker}`);
    contents = contents.replace(releaseSigning, '$1// Configure a private release signing key before distribution.');
    mod.modResults.contents = contents;
    return mod;
  });
};
