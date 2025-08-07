import { gray, red } from "ansi-colors";
import { dest, parallel, src, watch } from "gulp";
import esbuild from "gulp-esbuild";
import type { reporter } from "gulp-typescript";
import { createProject } from "gulp-typescript";
import del from "del";
import { pipeline } from "stream/promises";

export function goodReporter(): reporter.Reporter {
  return {
    error: (error, typescript) => {
      if (error.tsFile) {
        console.log(
          `[${gray("gulp-typescript")}] ${red(
            `${error.fullFilename}(${error.startPosition!.line + 1},${
              error.startPosition!.character
            }): `,
          )}error TS${
            error.diagnostic.code
          }: ${typescript.flattenDiagnosticMessageText(
            error.diagnostic.messageText,
            "\n",
          )}`,
        );
      } else {
        console.log(error.message);
      }
    },
  };
}

const tsProject = createProject("tsconfig.json");

export function cleanOutput() {
  return tsProject.projectDirectory
    ? del(`${tsProject.projectDirectory}/out/*`)
    : Promise.resolve();
}

export function compileEsbuild() {
  return pipeline(
    src("./src/extension.ts"),
    esbuild({
      outfile: "extension.js",
      bundle: true,
      external: ["vscode", "fsevents"],
      format: "cjs",
      platform: "node",
      target: "es2020",
      sourcemap: "linked",
      sourceRoot: "..",
      loader: {
        ".node": "copy",
      },
    }),
    dest("out"),
  );
}

export function watchEsbuild() {
  watch(["src/**/*.ts", "!src/view/**/*.ts"], compileEsbuild);
}

export function checkTypeScript() {
  // This doesn't actually output the TypeScript files, it just
  // runs the TypeScript compiler and reports any errors.
  return tsProject.src().pipe(tsProject(goodReporter()));
}

export function watchCheckTypeScript() {
  watch(["src/**/*.ts", "!src/view/**/*.ts"], checkTypeScript);
}

function copyWasmFiles() {
  // We need to copy this file for the source-map package to work. Without this fie, the source-map
  // package is not able to load the WASM file because we are not including the full node_modules
  // directory. In version 0.7.4, it is not possible to call SourceMapConsumer.initialize in Node environments
  // to configure the path to the WASM file. So, source-map will always load the file from `__dirname/mappings.wasm`.
  // In version 0.8.0, it may be possible to do this properly by calling SourceMapConsumer.initialize by
  // using the "browser" field in source-map's package.json to load the WASM file from a given file path.
  return src("node_modules/source-map/lib/mappings.wasm", {
    // WASM is a binary format, so don't try to re-encode it as text.
    encoding: false,
  }).pipe(dest("out"));
}

function copyNativeAddonFiles() {
  // We need to copy these files manually because we only want to include Windows x64 to limit
  // the size of the extension. Windows x64 is the most common platform that requires short path
  // expansion, so we only include this platform.
  // See src/common/short-paths.ts
  return pipeline(
    src("node_modules/koffi/build/koffi/win32_x64/*.node", {
      encoding: false,
    }),
    dest("out/koffi/win32_x64"),
  );
}

export const copyModules = parallel(copyWasmFiles, copyNativeAddonFiles);
