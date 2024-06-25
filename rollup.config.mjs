import path from 'path';
import copyAndWatch from './copy-and-watch.mjs';
import alias from '@rollup/plugin-alias';
import image from '@rollup/plugin-image';
import terser from '@rollup/plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import strip from '@rollup/plugin-strip';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import sass from 'rollup-plugin-sass';
// import { visualizer } from 'rollup-plugin-visualizer';

// prod is release build
if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

const HREF       = process.env.BASE_HREF || '';

// debug, profile, release
const BUILD_TYPE = process.env.BUILD_TYPE || 'release';

const ENGINE_DIR = process.env.ENGINE_PATH || './node_modules/playcanvas';
const ENGINE_NAME = (BUILD_TYPE === 'debug') ? 'playcanvas.dbg/src/index.js' : 'playcanvas/src/index.js';
const ENGINE_PATH = path.resolve(ENGINE_DIR, 'build', ENGINE_NAME);

const PCUI_DIR = path.resolve(process.env.PCUI_PATH || 'node_modules/@playcanvas/pcui');

const aliasEntries = {
    playcanvas: ENGINE_PATH,
    pcui: PCUI_DIR
};

const tsCompilerOptions = {
    baseUrl: '.',
    paths: {
        playcanvas: [ENGINE_DIR],
        pcui: [PCUI_DIR]
    }
};

const application = {
    input: 'src/index.ts',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        copyAndWatch({
            targets: [
                {
                    src: 'src/index.html',
                    transform: (contents, filename) => {
                        return contents.toString().replace('__BASE_HREF__', HREF);
                    }
                },
                {src: 'src/manifest.json'},
                {src: 'static/images', dest: 'static'},
                {src: 'static/icons', dest: 'static'},
                {src: 'static/env/VertebraeHDRI_v1_512.png', dest: 'static/env'}
            ]
        }),
        alias({entries: aliasEntries}),
        resolve(),
        image({dom: true}),
        sass({
            output: false,
            insert: true
        }),
        json(),
        typescript({
            compilerOptions: tsCompilerOptions
        }),
        BUILD_TYPE === 'release' &&
            strip({
                include: ['**/*.ts'],
                functions: ['Debug.exec']
            }),
        BUILD_TYPE !== 'debug' && terser()
        // visualizer()
    ],
    treeshake: 'smallest',
    cache: false
};

const serviceWorker = {
    input: 'src/sw.ts',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        resolve(),
        json(),
        typescript({
            compilerOptions: tsCompilerOptions
        }),
        // BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};

export default [
    application,
    serviceWorker
];
