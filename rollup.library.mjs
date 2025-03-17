import path from 'path';
import alias from '@rollup/plugin-alias';
import image from '@rollup/plugin-image';
import terser from '@rollup/plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import strip from '@rollup/plugin-strip';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import { string } from 'rollup-plugin-string';
import fs from 'fs';

import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import sass from 'sass';
import scss from 'rollup-plugin-scss';

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

const outputHeader = () => {
    const BLUE_OUT = '\x1b[34m';
    const BOLD_OUT = `\x1b[1m`;
    const REGULAR_OUT = `\x1b[22m`;
    const RESET_OUT = `\x1b[0m`;

    const title = [
        `Building SuperSplat`,
        `type ${BOLD_OUT}${BUILD_TYPE}${REGULAR_OUT}`,
        `engine ${BOLD_OUT}${ENGINE_DIR}${REGULAR_OUT}`,
        `pcui ${BOLD_OUT}${PCUI_DIR}${REGULAR_OUT}`
    ].map(l => `${BLUE_OUT}${l}`).join(`\n`);
    console.log(`${BLUE_OUT}${title}${RESET_OUT}\n`);
};

outputHeader();

const tsCompilerOptions = {
    baseUrl: '.',
    paths: {
        playcanvas: [ENGINE_DIR],
        pcui: [PCUI_DIR]
    },
    declaration: true,
    declarationMap: true, 
    declarationDir: 'lib',
    emitDeclarationOnly: true
};

const srcDir = 'src';
const inputFiles = fs.readdirSync(srcDir)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'))  // Only include .ts files
    .reduce((acc, file) => {
        const name = path.parse(file).name;
        acc[name] = path.join(srcDir, file);
        return acc;
    }, {});

const aliasEntries = [
    { find: 'playcanvas', replacement: ENGINE_PATH },
    { find: 'pcui', replacement: PCUI_DIR }
];

const library = {
    input: inputFiles,
    output: {
        dir: 'lib',
        format: 'esm',
        sourcemap: true,
        preserveModules: true,
        preserveModulesRoot: 'src'
    },
    plugins: [
        typescript({
            compilerOptions: tsCompilerOptions
        }),
        alias({ entries: aliasEntries }),
        json(),
        resolve(),

        image({ dom: false }),
        scss({
            sourceMap: true,
            runtime: sass,
            processor: (css) => {
                return postcss([autoprefixer])
                    .process(css, { from: undefined })
                    .then(result => result.css);
            },
            fileName: 'index.css',
            includePaths: [ path.resolve(PCUI_DIR, 'dist') ],
            exclude: ['src/templates/*']
        }),
        string({
            include: 'src/templates/*'
        }),
        
        BUILD_TYPE === 'release' &&
            strip({
                include: ['**/*.ts'],
                functions: ['Debug.exec']
            }),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};

export default [
    library
];
